import {
  ApiClient,
  HelixChatChatter,
  HelixCreateCustomRewardData,
  HelixUpdateCustomRewardData,
  HelixUser,
  UserIdResolvable,
} from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import * as tmi from "@twurple/auth-tmi";
import { settings } from "./settings.js";
import { Options as TmiOptions, Client as TmiClient } from "tmi.js";
import { SingleValueCache } from "./cache.js";
import { Duration } from "@js-joda/core";
import { sync as writeFileAtomicSync } from "write-file-atomic";
import { User } from "./extensions-api/queue-entry.js";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { twitch } from "./twitch.js";
import i18next from "i18next";
import { warn } from "./chalk-print.js";
import {
  EventSubChannelRedemptionAddEvent,
  EventSubChannelRedemptionUpdateEvent,
  EventSubStreamOfflineEvent,
  EventSubStreamOnlineEvent,
} from "@twurple/eventsub-base";
import { InitialTokenScheme, loadToken, setupAuth } from "./twitch-auth.js";

const tokensFileName = "./settings/tokens.json";
const broadcasterTokensFileName = "./settings/tokens.broadcaster.json";

class TwitchApi {
  #authProvider: RefreshingAuthProvider | null = null;
  #botUserId: string | null = null;
  #apiClient: ApiClient | null = null;
  #broadcasterUser: HelixUser | null = null;
  #chattersCache: SingleValueCache<User[]>;
  #botTokenScopes: string[] = [];
  #broadcasterTokenScopes: string[] = [];
  #esListener: EventSubWsListener | null = null;
  #channel: string | null = null;

  constructor() {
    this.#chattersCache = new SingleValueCache(
      this.#loadChatters.bind(this),
      [],
      Duration.ofSeconds(30)
    );
  }

  get channel(): string {
    if (this.#channel == null) {
      throw new Error("Tried to load channel before client set up");
    }
    return this.#channel;
  }

  // visible for testing
  get apiClient(): ApiClient {
    if (this.#apiClient == null) {
      throw new Error("Tried to load chatters before client set up");
    }
    return this.#apiClient;
  }

  // visible for event sub
  get broadcasterId(): string {
    if (this.#broadcasterUser == null) {
      throw new Error("Tried to access broadcaster ID before client set up");
    }
    return this.#broadcasterUser.id;
  }

  private get broadcaster(): UserIdResolvable {
    if (this.#broadcasterUser == null) {
      throw new Error("Tried to load chatters before client set up");
    }
    return this.#broadcasterUser;
  }

  get botTokenScopes(): string[] {
    return this.#botTokenScopes;
  }

  get broadcasterTokenScopes(): string[] {
    return this.#broadcasterTokenScopes;
  }

  /**
   * Setup authentication.
   */
  async setup() {
    this.#authProvider = setupAuth();

    // validation is done before setting anything up to help users figure out problems early
    const tokenData = loadToken(tokensFileName);

    // Register the onRefresh callback
    this.#authProvider.onRefresh((userId, newTokenData) => {
      let fileName;
      if (this.#botUserId == null || this.#botUserId == userId) {
        // this has to be the bot token, since the id is not known yet or matches
        fileName = tokensFileName;
      } else if (this.#broadcasterUser?.id == userId) {
        // note that `this.#broadcasterUser` is set before the token is even added to the provider
        fileName = broadcasterTokensFileName;
      } else {
        throw new Error(
          `Unknown token with user id ${userId}. Does the channel setting differ from the token user?`
        );
      }
      writeFileAtomicSync(fileName, JSON.stringify(newTokenData, null, 4), {
        encoding: "utf-8",
      });
    });

    // register refresh and access token of the bot and get the user id of the bot
    // this token is used for both chat as well as api calls
    this.#botUserId = await this.#authProvider.addUserForToken(tokenData, [
      "chat",
      "user-by-name",
      "user-by-id",
      "stream-online",
    ]);
    // create the api client
    this.#apiClient = new ApiClient({
      authProvider: this.#authProvider,
      logger: {
        //minLevel: 'debug'
      },
    });

    // setting settings.channel is deprecated
    // running the queue with only a bot token is still possible, but requires settings.channel to be set
    let broadcasterId: string | undefined;
    if (settings.channel == null) {
      // look for the broadcaster file
      let tokenData: InitialTokenScheme | undefined;
      try {
        tokenData = loadToken(broadcasterTokensFileName);
      } catch (err) {
        if (
          typeof err === "object" &&
          err != null &&
          "code" in err &&
          err.code === "ENOENT"
        ) {
          // There's no provided tokens for the broadcaster
          // this means that the bot token is the broadcaster!
        } else {
          throw err;
        }
      }
      if (tokenData) {
        // channel is the user from the broadcaster token
        broadcasterId = await this.#authProvider.addUserForToken(tokenData, [
          "subscribers-by-broadcaster",
          "moderators-by-broadcaster",
          "custom-rewards",
        ]);
        const id = broadcasterId;
        this.#broadcasterUser = await this.#apiClient.asIntent(
          ["user-by-id"],
          async (ctx) => {
            const result = await ctx.users.getUserById(id);
            if (result == null) {
              throw new Error(`Could not get channel name for user id ${id}`);
            }
            return result;
          }
        );
        this.#channel = this.#broadcasterUser.name;
      } else {
        // channel is the user from the bot token
        const botUserId = this.#botUserId;
        this.#broadcasterUser = await this.#apiClient.asIntent(
          ["user-by-id"],
          async (ctx) => {
            const result = await ctx.users.getUserById(botUserId);
            if (result == null) {
              throw new Error(
                `Could not get channel name for user id ${this.#botUserId}`
              );
            }
            return result;
          }
        );
        this.#channel = this.#broadcasterUser.name;
      }
    } else {
      const channel = settings.channel;
      // get the user id of the channel/broadcaster
      this.#broadcasterUser = await this.#apiClient.asIntent(
        ["user-by-name"],
        async (ctx) => {
          return ctx.users.getUserByName(channel);
        }
      );
      // channel is from the settings
      this.#channel = channel;
    }

    // check to make sure we got the user ID successfully
    if (!this.#broadcasterUser) {
      throw new Error("Failed to get broadcaster user during API setup");
    }

    // get the scopes
    this.#botTokenScopes = this.#authProvider.getCurrentScopesForUser(
      this.#botUserId
    );
    if (this.#broadcasterUser.id == this.#botUserId) {
      // if the bot is the broadcaster add intents to bot/broadcaster account
      this.#authProvider.addIntentsToUser(this.#botUserId, [
        "subscribers-by-broadcaster",
        "moderators-by-broadcaster",
        "chatters",
        "custom-rewards",
      ]);
      this.#broadcasterTokenScopes = this.#botTokenScopes;
    } else {
      if (broadcasterId === undefined) {
        // look for a broadcaster tokens file
        let tokenData;
        try {
          tokenData = loadToken(broadcasterTokensFileName);
        } catch (err) {
          if (
            typeof err === "object" &&
            err != null &&
            "code" in err &&
            err.code === "ENOENT"
          ) {
            // There's no provided tokens for the broadcaster
            this.#broadcasterTokenScopes = [];
            this.#authProvider.addIntentsToUser(this.#botUserId, ["chatters"]);
          } else {
            throw err;
          }
        }
        if (tokenData) {
          broadcasterId = await this.#authProvider.addUserForToken(tokenData, [
            "subscribers-by-broadcaster",
            "moderators-by-broadcaster",
            "custom-rewards",
          ]);
        }
      }

      if (broadcasterId !== undefined) {
        const id = broadcasterId;
        if (id != this.#broadcasterUser.id) {
          throw new Error(
            `Broadcaster id ${
              this.#broadcasterUser.id
            } does not match token user id ${id}`
          );
        }
        this.#broadcasterTokenScopes =
          this.#authProvider.getCurrentScopesForUser(id);
        if (this.#broadcasterTokenScopes.includes("moderator:read:chatters")) {
          this.#authProvider.addIntentsToUser(id, ["chatters"]);
        } else {
          this.#authProvider.addIntentsToUser(this.#botUserId, ["chatters"]);
        }
      }
    }
    // set up the eventsub listener
    const apiClient = this.#apiClient;
    this.#esListener = new EventSubWsListener({ apiClient });

    if (
      !this.#botTokenScopes.includes("chat:edit") ||
      !this.#botTokenScopes.includes("chat:read") ||
      !(
        this.#broadcasterTokenScopes.includes("moderator:read:chatters") ||
        this.#botTokenScopes.includes("moderator:read:chatters")
      )
    ) {
      const err = i18next.t("requiredScopeError");
      throw new Error(err);
    }
    if (!this.#broadcasterTokenScopes.includes("channel:read:subscriptions")) {
      warn(i18next.t("subscribersScopeMissing"));
    }
    if (!this.#broadcasterTokenScopes.includes("moderation:read")) {
      warn(i18next.t("moderatorsScopeMissing"));
    }

    let startListener = false;
    if (this.#broadcasterTokenScopes.includes("channel:read:subscriptions")) {
      // set up the eventsub listeners for subs
      this.#esListener.onChannelSubscription(
        this.#broadcasterUser.id,
        twitch.handleSub
      );
      this.#esListener.onChannelSubscriptionEnd(
        this.#broadcasterUser.id,
        twitch.handleUnsub
      );
      startListener = true;
    }
    if (this.#broadcasterTokenScopes.includes("moderation:read")) {
      // Set up the eventsub listeners for mods
      this.#esListener.onChannelModeratorAdd(
        this.#broadcasterUser.id,
        twitch.handleMod
      );
      this.#esListener.onChannelModeratorRemove(
        this.#broadcasterUser.id,
        twitch.handleUnmod
      );
      startListener = true;
    }

    // We can only start the listener once
    if (startListener) {
      this.#esListener.start();
    }
  }

  /**
   * This creates a new tmi client where the authentication is setup automatically.
   *
   * How the tmi client is authenticating is transparent to the user.
   *
   * @param opts The options of the tmi client.
   * @returns A new tmi client that has authentication build in.
   */
  createTmiClient(opts: TmiOptions): TmiClient {
    if (this.#authProvider == null) {
      throw new Error("#authProvider null when creating client");
    }
    return new tmi.client({ ...opts, authProvider: this.#authProvider });
  }

  async #loadChatters() {
    const mapUser = (user: HelixChatChatter) => ({
      id: user.userId,
      name: user.userName,
      displayName: user.userDisplayName,
    });
    return await this.apiClient.asIntent(["chatters"], async (ctx) => {
      const result: User[] = [];
      // request the maximum of 1000 to reduce number of requests
      let page = await ctx.chat.getChatters(this.broadcaster, {
        limit: 1000,
      });
      result.push(...page.data.map(mapUser));
      while (page.cursor != null) {
        page = await ctx.chat.getChatters(this.broadcaster, {
          after: page.cursor,
          limit: 1000,
        });
        result.push(...page.data.map(mapUser));
      }
      // log(`Fetched ${result.length} chatters`);
      return result;
    });
  }

  /**
   * @returns if the api has limited use
   */
  async #isLimited(): Promise<boolean> {
    const rateLimiterStats = await this.apiClient.asIntent(
      ["chatters"],
      (ctx) => Promise.resolve(ctx.rateLimiterStats)
    );
    return (
      rateLimiterStats != null &&
      rateLimiterStats.lastKnownRemainingRequests != null &&
      rateLimiterStats.lastKnownRemainingRequests < 3
    );
  }

  /**
   * Get a list of chatters.
   *
   * The contents are cached for 30 seconds, however the cache could be kept for longer if the api is limitting or errors.
   *
   * @param forceRefresh If set to true this always reloads chatters from the api.
   * @returns chatters
   */
  async getChatters(forceRefresh: boolean): Promise<User[]> {
    if (forceRefresh) {
      // log("Force refresh");
      return await this.#chattersCache.fetch({
        forceRefresh: forceRefresh,
      });
    }
    if (await this.#isLimited()) {
      warn("Use cache because of rate limits.");
      // use cache because of rate limiting
      return this.#chattersCache.get();
    }
    return await this.#chattersCache.fetch();
  }

  get maxUsers() {
    return 100;
  }

  private mapUser(user: HelixUser) {
    // make id, name, and displayName writable
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
    };
  }

  async getUsers(userNames: string[]): Promise<User[]> {
    return await this.apiClient.asIntent(["user-by-name"], async (ctx) => {
      return (await ctx.users.getUsersByNames(userNames)).map((user) =>
        this.mapUser(user)
      );
    });
  }

  async getUsersById(userIds: string[]): Promise<User[]> {
    return await this.apiClient.asIntent(["user-by-id"], async (ctx) => {
      return (await ctx.users.getUsersByIds(userIds)).map((user) =>
        this.mapUser(user)
      );
    });
  }

  async getSubscribers() {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to get subscriptions without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    const subscribers = await this.apiClient.asIntent(
      ["subscribers-by-broadcaster"],
      async (ctx) => {
        return await ctx.subscriptions.getSubscriptions(broadcasterId);
      }
    );
    if (subscribers == undefined) {
      // Not sure if this is because there was a problem, or just because the broadcaster has no subs
      return [];
    }

    // Extract all the user IDs
    const subscriberUsers = subscribers.data.map((subscriber) => {
      return {
        id: subscriber.userId,
        name: subscriber.userName,
        displayName: subscriber.userDisplayName,
      };
    });
    return subscriberUsers;
  }

  async getModerators() {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to get subscriptions without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    const mods = await this.apiClient.asIntent(
      ["moderators-by-broadcaster"],
      async (ctx) => {
        return await ctx.moderation.getModerators(broadcasterId);
      }
    );
    if (mods == undefined) {
      // Not sure if this is because there was a problem, or just because the broadcaster has no subs
      return [];
    }

    // Extract all the user IDs
    const modUsers = mods.data.map((mod) => {
      return {
        id: mod.userId,
        name: mod.userName,
        displayName: mod.userDisplayName,
      };
    });
    return modUsers;
  }

  async getCustomRewards() {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to get rewards without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    const rewards = await this.apiClient.asIntent(
      ["custom-rewards"],
      async (ctx) => {
        return await ctx.channelPoints.getCustomRewards(broadcasterId, true);
      }
    );
    return rewards;
  }

  async getCustomRewardById(id: string) {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to get reward without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    const reward = await this.apiClient.asIntent(
      ["custom-rewards"],
      async (ctx) => {
        try {
          return await ctx.channelPoints.getCustomRewardById(broadcasterId, id);
        } catch (err) {
          if (
            typeof err === "object" &&
            err != null &&
            "_statusCode" in err &&
            err._statusCode == "404"
          ) {
            // The reward was deleted, which means it should be null
            return null;
          } else {
            throw err;
          }
        }
      }
    );
    return reward;
  }

  async createCustomReward(rewardData: HelixCreateCustomRewardData) {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to create reward without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    return this.apiClient.asIntent(["custom-rewards"], async (ctx) => {
      return await ctx.channelPoints.createCustomReward(
        broadcasterId,
        rewardData
      );
    });
  }

  async updateCustomReward(
    id: string,
    rewardData: HelixUpdateCustomRewardData
  ) {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to update reward without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    return this.apiClient.asIntent(["custom-rewards"], async (ctx) => {
      return await ctx.channelPoints.updateCustomReward(
        broadcasterId,
        id,
        rewardData
      );
    });
  }

  async getCustomRewardRedemptions(id: string) {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to update reward without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    return this.apiClient.asIntent(["custom-rewards"], async (ctx) => {
      const list = await ctx.channelPoints.getRedemptionsForBroadcaster(
        broadcasterId,
        id,
        "UNFULFILLED",
        { newestFirst: true }
      );
      return list.data.reverse();
    });
  }

  async updateCustomRewardRedemption(
    reward: string,
    redemption: string,
    status: "FULFILLED" | "CANCELED"
  ) {
    if (this.#broadcasterUser == null) {
      throw new Error("Trying to update reward without a broadcaster set");
    }

    const broadcasterId = this.#broadcasterUser.id;
    return this.apiClient.asIntent(["custom-rewards"], async (ctx) => {
      return await ctx.channelPoints.updateRedemptionStatusByIds(
        broadcasterId,
        reward,
        [redemption],
        status
      );
    });
  }

  registerRedemptionCallbacks(
    id: string,
    add: (data: EventSubChannelRedemptionAddEvent) => void,
    update: (data: EventSubChannelRedemptionUpdateEvent) => void
  ) {
    if (this.#esListener == null || this.#broadcasterUser == undefined) {
      throw new Error(
        "Trying to register channel point redemptions before API set up"
      );
    }
    this.#esListener.onChannelRedemptionAddForReward(
      this.#broadcasterUser.id,
      id,
      add
    );
    this.#esListener.onChannelRedemptionUpdateForReward(
      this.#broadcasterUser.id,
      id,
      update
    );
  }

  registerStreamCallbacks(
    onlineHandler: (event: EventSubStreamOnlineEvent) => void,
    offlineHandler: (event: EventSubStreamOfflineEvent) => void
  ) {
    if (this.#esListener == null || this.#broadcasterUser == undefined) {
      throw new Error(
        "Trying to register online/offline handlers before API set up"
      );
    }

    this.#esListener.onStreamOnline(this.#broadcasterUser, onlineHandler);
    this.#esListener.onStreamOffline(this.#broadcasterUser, offlineHandler);
  }

  async isStreamOnline(): Promise<boolean> {
    return await this.apiClient.asIntent(["stream-online"], async (ctx) => {
      if (this.#broadcasterUser == null) {
        throw new Error("#broadcasterUser null");
      }
      return (
        (await ctx.streams.getStreamByUserId(this.#broadcasterUser)) != null
      );
    });
  }
}

export const twitchApi = new TwitchApi();
