import { Duration } from "@js-joda/core";
import { Chatter } from "./extensions-api/command.js";
import {
  QueueSubmitter,
  User,
  isQueueSubmitter,
} from "./extensions-api/queue-entry.js";
import { twitchApi } from "./twitch-api.js";
import TTLCache from "@isaacs/ttlcache";
import { EventSubChannelSubscriptionEvent } from "@twurple/eventsub-base";

const RECENT_CHATTERS_TTL = Duration.parse("PT5M").toMillis();
const LURKERS_TTL = Duration.parse("PT12H").toMillis();
const SUBSCRIBERS_TTL = Duration.parse("PT12H").toMillis();
const MODS_TTL = Duration.parse("PT12H").toMillis();

const recentChatters = new TTLCache<string, Chatter>({
  ttl: RECENT_CHATTERS_TTL,
});
const lurkers = new TTLCache<string, Chatter>({ ttl: LURKERS_TTL });
const subscribers = new TTLCache<string, Chatter>({ ttl: SUBSCRIBERS_TTL });
const mods = new TTLCache<string, Chatter>({ ttl: MODS_TTL });

type OnlineUser = { online: boolean; user: User } | { online: false };

export interface OnlineUsers {
  users: Map<string, OnlineUser>;
  names: Map<string, string>; // from name to id
  displayNames: Map<string, string>; // from displayName to id
  isOnline(submitter: Partial<User>): boolean;
  getOnlineUser(submitter: Partial<User>): OnlineUser;
}

export function createOnlineUsers(
  usersArgument: User[] | OnlineUsers,
  filter?: (submitter: User) => boolean
): OnlineUsers {
  if (!Array.isArray(usersArgument)) {
    if (filter != null) {
      for (const value of usersArgument.users.values()) {
        if (value.online && !filter(value.user)) {
          value.online = false;
        }
      }
    }
    return usersArgument;
  }
  let users;
  if (filter != null) {
    users = new Map(
      usersArgument.map((user) => [user.id, { user, online: filter(user) }])
    );
  } else {
    users = new Map(
      usersArgument.map((user) => [user.id, { user, online: true }])
    );
  }
  const names = new Map(usersArgument.map((user) => [user.name, user.id]));
  const displayNames = new Map(
    usersArgument.map((user) => [user.displayName, user.id])
  );

  return {
    users,
    names,
    displayNames,
    isOnline(submitter) {
      return this.getOnlineUser(submitter).online;
    },
    getOnlineUser(submitter) {
      if (submitter.id !== undefined) {
        return this.users.get(submitter.id) ?? { online: false };
      }
      if (submitter.name !== undefined) {
        const id = this.names.get(submitter.name);
        if (id === undefined) {
          return { online: false };
        }
        return this.users.get(id) ?? { online: false };
      }
      if (submitter.displayName !== undefined) {
        const id = this.displayNames.get(submitter.displayName);
        if (id === undefined) {
          return { online: false };
        }
        return this.users.get(id) ?? { online: false };
      }
      return { online: false };
    },
  };
}

const twitch = {
  async getOnlineUsers(forceRefresh = false): Promise<OnlineUsers> {
    const chatters = await twitchApi.getChatters(forceRefresh);
    recentChatters.purgeStale(); // manually calling this because we are calling values()
    return createOnlineUsers(
      [...chatters, ...recentChatters.values()], // prefer recent chatters over chatters (items appearing later in the list override earlier items)
      (user) => !lurkers.has(user.id)
    );
  },

  isSubscriber: (submitter: QueueSubmitter) => {
    return subscribers.has(submitter.id);
  },

  /**
   * Updates the list of subscribers in chat, assuming the API token has permission to.
   */
  async updateSubscribers() {
    if (!twitchApi.tokenScopes.includes("channel:read:subscriptions")) {
      return;
    }

    for (const subscriber of await twitchApi.getSubscribers()) {
      const subscriberChatter: Chatter = {
        ...subscriber,
        equals(other) {
          return isQueueSubmitter(this, other);
        },
      };
      if (!subscribers.has(subscriberChatter.id)) {
        subscribers.set(subscriberChatter.id, subscriberChatter, {});
      }
    }
  },

  async handleSub(event: EventSubChannelSubscriptionEvent) {
    console.log(`Got subscription event for ${event.userDisplayName}`);
    if (!subscribers.has(event.userId)) {
      const subscriberChatter: Chatter = {
        id: event.userId,
        name: event.userName,
        displayName: event.userDisplayName,
        isSubscriber: true,
        isBroadcaster: false,
        isMod: false,
        equals(other) {
          return isQueueSubmitter(this, other);
        },
      };
      subscribers.set(subscriberChatter.id, subscriberChatter);
      console.log(`Added ${event.userDisplayName} to subscribers list`);
    }
  },

  async getOnlineSubscribers(forceRefresh = false): Promise<OnlineUsers> {
    const onlineUsers = await twitch.getOnlineUsers(forceRefresh);
    return createOnlineUsers(onlineUsers, (submitter) =>
      subscribers.has(submitter.id)
    );
  },

  async getOnlineMods(forceRefresh = false): Promise<OnlineUsers> {
    const onlineUsers = await twitch.getOnlineUsers(forceRefresh);
    return createOnlineUsers(onlineUsers, (submitter) =>
      mods.has(submitter.id)
    );
  },

  noticeChatter: (chatter: Chatter) => {
    recentChatters.set(chatter.id, chatter, { noUpdateTTL: false });
    if (chatter.isSubscriber) {
      subscribers.set(chatter.id, chatter, { noUpdateTTL: false });
    }
    if (chatter.isMod) {
      mods.set(chatter.id, chatter, { noUpdateTTL: false });
    }
  },

  setToLurk: (submitter: Chatter) => {
    lurkers.set(submitter.id, submitter);
  },

  checkLurk: (submitter: QueueSubmitter) => {
    if (lurkers.has(submitter.id)) {
      return true;
    } else {
      return false;
    }
  },

  notLurkingAnymore(submitter: Partial<QueueSubmitter>): boolean {
    lurkers.purgeStale(); // manually calling this because we are calling entries()
    let username: string | undefined;
    let displayName: string | undefined;
    if (submitter.id != null) {
      return lurkers.delete(submitter.id);
    }
    if (submitter.name != null) {
      username = submitter.name;
    } else if (submitter.displayName != null) {
      displayName = submitter.displayName;
    } else {
      // can not remove anyone with no `id`, `name`, nor `displayName`
      return false;
    }
    // linear search username or displayName
    let removed = false;
    const removeKeys = [];
    for (const [key, value] of lurkers.entries()) {
      if (value.name === username || value.displayName === displayName) {
        removeKeys.push(key);
        // note that there might be multiple lurkers with the same username or displayName if someone renamed themselves
        // therefore we continue the loop until the end
      }
    }
    // delete outside of the iterator
    removeKeys.forEach((key) => {
      removed = lurkers.delete(key) || removed;
    });
    return removed;
  },

  clearLurkers: () => {
    lurkers.clear();
  },
};

type Twitch = typeof twitch;

export { twitch, Twitch };
