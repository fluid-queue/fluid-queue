const tmi = require('tmi.js');

const build_chatter = function(username, displayName, isSubscriber, isMod, isBroadcaster) {
  return {
    username: username,
    displayName: displayName,
    isSubscriber: isSubscriber,
    isMod: isMod,
    isBroadcaster: isBroadcaster
  }
}

const chatbot_helper = function(username, password, channel) {
  var tmi_settings = {
    identity: {
      username: username,
      password: password
    },
    channels: [
      channel
    ]
  };
  return {
    client: new tmi.client(tmi_settings),

    connect: function() {
      // Connect to Twitch:
      this.client.connect();
    },

    setup: function(handle_func) {
      var client = this.client;
      // Called every time the bot connects to Twitch chat
      function onConnectedHandler(addr, port) {
        console.log(`* Connected to ${addr}:${port}`);
      }

      // Called every time a message comes in
      function onMessageHandler(channel, tags, message, self) {
        if (self) { return; } // Ignore messages from the bot

        // Remove whitespace from chat message
        const command = message.trim();
        const respond = (response_text) => {
          if (response_text !== undefined) { // if i18n errors the response_text might be undefined
            client.say(channel, response_text);
          }
        };
        var chatter;
        if (tags.badges == null) {
          chatter = build_chatter(tags.username,
            tags['display-name'],
            false,
            false,
            false);
        } else {
          chatter = build_chatter(tags.username,
            tags['display-name'],
            tags.badges.subscriber != undefined,
            tags.badges.moderator != undefined,
            tags.badges.broadcaster != undefined);
        }
        handle_func(command, chatter, respond);
      }
      // Register our event handlers (defined below)
      this.client.on('connected', onConnectedHandler);
      this.client.on('message', onMessageHandler);
    },

    say: function(message) {
      this.client.say('#' + channel, message);
    }
  };
};

module.exports = {
  helper: function(username, password, channel) {
    return chatbot_helper(username, password, channel);
  },
};
