const { ApiClient } = require("@twurple/api");
const { RefreshingAuthProvider } = require("@twurple/auth");
const tmi = require("@twurple/auth-tmi");
const settings = require("./settings").default;
const fs = require("fs");
const gracefulFs = require("graceful-fs");
const { SingleValueCache } = require("./cache.js");

const tokensFileName = "./settings/tokens.json";

class TwitchApi {
  /**
   * @type {?RefreshingAuthProvider}
   */
  #authProvider;
  /**
   * @type {?string}
   */
  #botUserId;
  /**
   * @type {?ApiClient}
   */
  #apiClient;
  /**
   * @type {?import('@twurple/api').HelixUser}
   */
  #broadcasterUser;
  /**
   * @type {SingleValueCache<import('@twurple/api').HelixChatChatter[]>}
   */
  #chattersCache;

  constructor() {
    this.#chattersCache = new SingleValueCache(
      this.#loadChatters.bind(this),
      [],
      30_000
    );
  }

  // visible for testing
  /**
   * @type {?ApiClient}
   */
  get apiClient() {
    return this.#apiClient;
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
      throw new Error(`${settings.fileName}: Invalid clientId.`);
    }
    if (
      settings.clientSecret == null ||
      settings.clientSecret == "" ||
      settings.clientSecret == "{YOUR_CLIENT_SECRET}"
    ) {
      throw new Error(`${settings.fileName}: Invalid clientSecret.`);
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
      onRefresh: async (userId, newTokenData) =>
        await gracefulFs.writeFile(
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
   * @param {import('@types/tmi.js').Options} opts The options of the tmi client.
   * @returns {import('@types/tmi.js').Client} A new tmi client that has authentication build in.
   */
  createTmiClient(opts) {
    return new tmi.client({ ...opts, authProvider: this.#authProvider });
  }

  async #loadChatters() {
    return await this.#apiClient.asIntent(["chatters"], async (ctx) => {
      const result = [];
      const pushAll = (data) => data.forEach(result.push.bind(result));
      // request the maximum of 1000 to reduce number of requests
      let page = await ctx.chat.getChatters(
        this.#broadcasterUser,
        this.#botUserId,
        { limit: 1000 }
      );
      pushAll(page.data);
      while (page.cursor != null) {
        page = await ctx.chat.getChatters(
          this.#broadcasterUser,
          this.#botUserId,
          { cursor: page.cursor }
        );
        pushAll(page.data);
      }
      // console.log(`Fetched ${result.length} chatters`);
      return result;
    });
  }

  /**
   * @returns {Promise<boolean>} if the api has limited use
   */
  async #isLimited() {
    const rateLimiterStats = await this.#apiClient.asIntent(
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
   * @param {boolean} invalidateCache If set to true this always reloads chatters from the api.
   * @returns {Promise<import('@twurple/api').HelixChatChatter[]>}
   */
  async getChatters(options = {}) {
    options = { forceRefresh: false, ...options };
    if (options.forceRefresh) {
      // console.log("Force refresh");
      return await this.#chattersCache.fetch({
        forceRefresh: options.forceRefresh,
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

module.exports = {
  TwitchApi,
  twitchApi: new TwitchApi(),
};
