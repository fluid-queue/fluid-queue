import { Chatter } from "./extensions-api/command.js";
import {
  QueueSubmitter,
  isQueueSubmitter,
} from "./extensions-api/queue-entry.js";
import { twitchApi } from "./twitch-api.js";
import { ChatUserstate, Client } from "tmi.js";

const build_chatter = function (
  userId: string,
  username: string,
  displayName: string,
  isSubscriber: boolean,
  isMod: boolean,
  isBroadcaster: boolean
): Chatter {
  return {
    toString() {
      return this.displayName;
    },
    equals(other: Partial<QueueSubmitter>) {
      return isQueueSubmitter(this, other);
    },
    id: userId,
    name: username,
    displayName: displayName,
    isSubscriber: isSubscriber,
    isMod: isMod,
    isBroadcaster: isBroadcaster,
  };
};

type HandleFunc = (
  command: string,
  chatter: Chatter,
  respond: (response_text: string) => void
) => void;

export type Chatbot = {
  client: Client | null;
  handle_func: HandleFunc | null;
  connect: () => Promise<[string, number]>;
  setup: (handle_func: HandleFunc) => void;
  say: (message: string) => void;
};

const chatbot_helper = function (channel: string): Chatbot {
  const tmi_settings = {
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
        const onConnectedHandler = (addr: string, port: number) => {
          console.log(`* Connected to ${addr}:${port}`);
        };

        // Called every time a message comes in
        const onMessageHandler = (
          channel: string,
          tags: ChatUserstate,
          message: string,
          self: boolean
        ) => {
          if (self) {
            return;
          } // Ignore messages from the bot
          // Remove whitespace from chat message
          const command = message.trim();
          const respond = (response_text: string) => {
            void client.say(channel, response_text);
          };
          let chatter;
          if (!tags.username || !tags["display-name"] || !tags["user-id"]) {
            throw new Error(
              "Encountered a user with no user id, username or no display name"
            );
          }
          if (tags.badges == null) {
            chatter = build_chatter(
              tags["user-id"],
              tags.username,
              tags["display-name"],
              false,
              false,
              false
            );
          } else {
            chatter = build_chatter(
              tags["user-id"],
              tags.username,
              tags["display-name"],
              tags.badges.subscriber != undefined ||
                tags.badges.founder != undefined,
              tags.badges.moderator != undefined,
              tags.badges.broadcaster != undefined
            );
          }
          if (!this.handle_func) {
            throw new Error("Handled a message before handler func set up");
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

    setup(handle_func: HandleFunc) {
      this.handle_func = handle_func;
    },

    say: function (message: string) {
      if (this.client == null) {
        throw new Error("Trying to send message with null client");
      }
      void this.client.say("#" + channel, message);
    },
  };
};

export function helper(channel: string) {
  return chatbot_helper(channel);
}
