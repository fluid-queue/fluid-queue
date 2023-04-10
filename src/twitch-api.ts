import { ApiClient, UserIdResolvable } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import * as tmi from "@twurple/auth-tmi";
import { settings, fileName as settingsFile } from "./settings";
import * as fs from "fs";
import * as gracefulFs from "graceful-fs";
import { Options as TmiOptions, Client as TmiClient } from "tmi.js";
import { HelixChatChatter, HelixUser } from "@twurple/api/lib";
import { SingleValueCache } from "./cache";
import { Duration } from "@js-joda/core";

const tokensFileName = "./settings/tokens.json";

class TwitchApi {
  #authProvider: RefreshingAuthProvider | null = null;
  #botUserId: string | null = null;
  #apiClient: ApiClient | null = null;
  #broadcasterUser: HelixUser | null = null;
  #chattersCache: SingleValueCache<HelixChatChatter[]>;

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

  private get broadcaster(): UserIdResolvable {
    if (this.#broadcasterUser == null) {
      throw new Error("Tried to load chatters before client set up");
    }
    return this.#broadcasterUser;
  }

  private get moderator(): UserIdResolvable {
    if (this.#botUserId == null) {
      throw new Error("Tried to load chatters before client set up");
    }
    return this.#botUserId;
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
    const tokenData = JSON.parse(fs.readFileSync(tokensFileName, "utf-8"));
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
      onRefresh: (userId, newTokenData) =>
        gracefulFs.writeFileSync(
          tokensFileName,
          JSON.stringify(newTokenData, null, 4),
          "utf-8"
        ),
    });
    // register refresh and access token of the bot and get the user id of the bot
    // this token is used for both chat as well as api calls
    this.#botUserId = await this.#authProvider.addUserForToken(tokenData, [
      "chat",
      "user-by-name",
      "chatters",
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
    return await this.apiClient.asIntent(["chatters"], async (ctx) => {
      const result: HelixChatChatter[] = [];
      // request the maximum of 1000 to reduce number of requests
      let page = await ctx.chat.getChatters(
        this.broadcaster,
        this.moderator,
        { limit: 1000 }
      );
      result.push(...page.data);
      while (page.cursor != null) {
        page = await ctx.chat.getChatters(
          this.broadcaster,
          this.moderator,
          { after: page.cursor, limit: 1000 }
        );
        result.push(...page.data);
      }
      // console.log(`Fetched ${result.length} chatters`);
      return result;
    });
  }

  /**
   * @returns if the api has limited use
   */
  async #isLimited(): Promise<boolean> {
    const rateLimiterStats = await this.apiClient.asIntent(
      ["chatters"],
      async (ctx) => ctx.rateLimiterStats
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
  async getChatters(forceRefresh: boolean): Promise<HelixChatChatter[]> {
    if (forceRefresh) {
      // console.log("Force refresh");
      return await this.#chattersCache.fetch({
        forceRefresh: forceRefresh,
      });
    }
    if (await this.#isLimited()) {
      console.warn("Use cache because of rate limits.");
      // use cache because of rate limiting
      return this.#chattersCache.get();
    }
    return await this.#chattersCache.fetch();
  }
}

export const twitchApi = new TwitchApi();
