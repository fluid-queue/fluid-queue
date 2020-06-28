const tmi = require('tmi.js');

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
          client.say(channel, response_text);
        };
        handle_func(command, tags.username, respond);
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
