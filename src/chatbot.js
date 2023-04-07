const { twitchApi } = require("./twitch-api.js");

const build_chatter = function (
  username,
  displayName,
  isSubscriber,
  isMod,
  isBroadcaster
) {
  return {
    username: username,
    displayName: displayName,
    isSubscriber: isSubscriber,
    isMod: isMod,
    isBroadcaster: isBroadcaster,
  };
};

const chatbot_helper = function (channel) {
  var tmi_settings = {
    connection: {
      reconnect: true,
      maxReconnectAttempts: 50,
      secure: true,
      timeout: 20000,
    },
    channels: [channel],
  };
  return {
    client: null,
    handle_func: null,

    async connect() {
      const client = twitchApi.createTmiClient(tmi_settings);
      this.client = client;
      if (this.handle_func != null) {
        // Called every time the bot connects to Twitch chat
        const onConnectedHandler = (addr, port) => {
          console.log(`* Connected to ${addr}:${port}`);
        };

        // Called every time a message comes in
        const onMessageHandler = (channel, tags, message, self) => {
          if (self) {
            return;
          } // Ignore messages from the bot
          // Remove whitespace from chat message
          const command = message.trim();
          const respond = (response_text) => {
            client.say(channel, response_text);
          };
          var chatter;
          if (tags.badges == null) {
            chatter = build_chatter(
              tags.username,
              tags["display-name"],
              false,
              false,
              false
            );
          } else {
            chatter = build_chatter(
              tags.username,
              tags["display-name"],
              tags.badges.subscriber != undefined ||
                tags.badges.founder != undefined,
              tags.badges.moderator != undefined,
              tags.badges.broadcaster != undefined
            );
          }
          this.handle_func(command, chatter, respond);
        };
        // Register our event handlers (defined below)
        client.on("connected", onConnectedHandler);
        client.on("message", onMessageHandler);
      }
      // Connect to Twitch:
      return await client.connect();
    },

    setup(handle_func) {
      this.handle_func = handle_func;
    },

    say: function (message) {
      this.client.say("#" + channel, message);
    },
  };
};

module.exports = {
  helper: function (channel) {
    return chatbot_helper(channel);
  },
};
