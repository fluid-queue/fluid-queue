import {
  ApiClient,
  HelixChatChatter,
  HelixUser,
  UserIdResolvable,
} from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import * as tmi from "@twurple/auth-tmi";
import { settings, fileName as settingsFile } from "./settings.js";
import fs from "fs";
import { Options as TmiOptions, Client as TmiClient } from "tmi.js";
import { SingleValueCache } from "./cache.js";
import { Duration } from "@js-joda/core";
import { sync as writeFileAtomicSync } from "write-file-atomic";
import { User } from "./extensions-api/queue-entry.js";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { twitch } from "./twitch.js";
import i18next from "i18next";
import { z } from "zod";
import { warn } from "./chalk-print.js";

const tokensFileName = "./settings/tokens.json";
const broadcasterTokensFileName = "./settings/tokens.broadcaster.json";

const InitialTokenScheme = z
  .object({
    accessToken: z.string().optional(),
    refreshToken: z.string().nullable(),
    scope: z.string().array().optional(), // optional when unknown
    expiresIn: z.number().nullable().default(0), // null means lives forever, 0 means unknown
    obtainmentTimestamp: z.number().default(0), // 0 means unknown
  })
  .passthrough();

class TwitchApi {
  #authProvider: RefreshingAuthProvider | null = null;
  #botUserId: string | null = null;
  #apiClient: ApiClient | null = null;
  #broadcasterUser: HelixUser | null = null;
  #chattersCache: SingleValueCache<User[]>;
  #botTokenScopes: string[] = [];
  #broadcasterTokenScopes: string[] = [];
  #esListener: EventSubWsListener | null = null;
  private chattersUserId: string | null = null;

  constructor() {
    this.#chattersCache = new SingleValueCache(
      this.#loadChatters.bind(this),
      [],
      Duration.ofSeconds(30)
    );
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
    if (
      settings.clientId == null ||
      settings.clientId == "" ||
      settings.clientId == "{YOUR_CLIENT_ID}"
    ) {
      throw new Error(`${settingsFile}: Invalid clientId.`);
    }
    if (
      settings.clientSecret == null ||
      settings.clientSecret == "" ||
      settings.clientSecret == "{YOUR_CLIENT_SECRET}"
    ) {
      throw new Error(`${settingsFile}: Invalid clientSecret.`);
    }
    // validation is done before setting anything up to help users figure out problems early
    const tokenData = InitialTokenScheme.parse(
      JSON.parse(fs.readFileSync(tokensFileName, "utf-8"))
    );
    if (
      tokenData.accessToken == null ||
      tokenData.accessToken == "" ||
      tokenData.accessToken == "{INITIAL_ACCESS_TOKEN}"
    ) {
      throw new Error(`Invalid ${tokensFileName} file: accessToken not found.`);
    }
    if (
      tokenData.refreshToken == null ||
      tokenData.refreshToken == "" ||
      tokenData.refreshToken == "{INITIAL_REFRESH_TOKEN}"
    ) {
      throw new Error(
        `Invalid ${tokensFileName} file: refreshToken not found.`
      );
    }

    // create the refreshing provider
    this.#authProvider = new RefreshingAuthProvider({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      onRefresh: (userId, newTokenData) => {
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
      },
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
    // get the user id of the channel/broadcaster
    this.#broadcasterUser = await this.#apiClient.asIntent(
      ["user-by-name"],
      async (ctx) => {
        return ctx.users.getUserByName(settings.channel);
      }
    );

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
      ]);
      this.chattersUserId = this.#botUserId;
      this.#broadcasterTokenScopes = this.#botTokenScopes;
    } else {
      // look for a broadcaster tokens file
      let tokenData;
      try {
        tokenData = InitialTokenScheme.parse(
          JSON.parse(fs.readFileSync(broadcasterTokensFileName, "utf-8"))
        );
      } catch (err) {
        if (
          typeof err === "object" &&
          err != null &&
          "code" in err &&
          err.code === "ENOENT"
        ) {
          // There's no provided tokens for the broadcaster
          this.#broadcasterTokenScopes = [];
          this.chattersUserId = this.#botUserId;
        } else {
          throw err;
        }
      }

      if (tokenData) {
        const id = await this.#authProvider.addUserForToken(tokenData, [
          "subscribers-by-broadcaster",
          "moderators-by-broadcaster",
        ]);
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
          this.chattersUserId = id;
        } else {
          this.chattersUserId = this.#botUserId;
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
    const result: User[] = [];
    // request the maximum of 1000 to reduce number of requests
    let page = await this.apiClient.chat.getChatters(
      this.broadcaster,
      this.chattersUser,
      {
        limit: 1000,
      }
    );
    result.push(...page.data.map(mapUser));
    while (page.cursor != null) {
      page = await this.apiClient.chat.getChatters(
        this.broadcaster,
        this.chattersUser,
        {
          after: page.cursor,
          limit: 1000,
        }
      );
      result.push(...page.data.map(mapUser));
    }
    // log(`Fetched ${result.length} chatters`);
    return result;
  }

  private get chattersUser(): UserIdResolvable {
    if (this.chattersUserId == null) {
      throw new Error("Tried to load chatters before client set up");
    }
    return this.chattersUserId;
  }

  /**
   * @returns if the api has limited use
   */
  async #isLimited(): Promise<boolean> {
    const rateLimiterStats = await this.apiClient.asUser(
      this.chattersUser,
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
