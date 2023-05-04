import { Duration } from "@js-joda/core";
import { Chatter } from "./extensions-api/command.js";
import { QueueSubmitter, User } from "./extensions-api/queue-entry.js";
import { twitchApi } from "./twitch-api.js";
import TTLCache from "@isaacs/ttlcache";

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

export interface OnlineUsers {
  users: Map<string, User>;
  names: Map<string, string>; // from name to id
  displayNames: Map<string, string>; // from displayName to id
  hasSubmitter(submitter: Partial<User>): boolean;
  getUser(submitter: Partial<User>): User | null;
}

function createOnlineUsers(
  usersArgument: User[] | OnlineUsers,
  filter?: (submitter: User) => boolean
): OnlineUsers {
  if (!Array.isArray(usersArgument)) {
    if (filter != null) {
      for (const [key, value] of usersArgument.users.entries()) {
        if (!filter(value)) {
          usersArgument.names.delete(value.name);
          usersArgument.displayNames.delete(value.displayName);
          usersArgument.users.delete(key);
        }
      }
    }
    return usersArgument;
  }
  const usersList = usersArgument.filter(filter ?? (() => true));
  const users = new Map(usersList.map((user) => [user.id, user]));
  const names = new Map(usersList.map((user) => [user.name, user.id]));
  const displayNames = new Map(
    usersList.map((user) => [user.displayName, user.id])
  );

  return {
    users,
    names,
    displayNames,
    hasSubmitter(submitter) {
      return this.getUser(submitter) != null;
    },
    getUser(submitter) {
      if (submitter.id !== undefined) {
        return this.users.get(submitter.id) ?? null;
      }
      if (submitter.name !== undefined) {
        const id = this.names.get(submitter.name);
        if (id === undefined) {
          return null;
        }
        return this.users.get(id) ?? null;
      }
      if (submitter.displayName !== undefined) {
        const id = this.displayNames.get(submitter.displayName);
        if (id === undefined) {
          return null;
        }
        return this.users.get(id) ?? null;
      }
      return null;
    },
  };
}

const twitch = {
  async getOnlineUsers(forceRefresh = false): Promise<OnlineUsers> {
    const chatters = await twitchApi.getChatters(forceRefresh);
    recentChatters.purgeStale(); // manually calling this because we are calling values()
    return createOnlineUsers(
      [...recentChatters.values(), ...chatters],
      (user) => !lurkers.has(user.id)
    );
  },

  isSubscriber: (submitter: QueueSubmitter | string) => {
    if (typeof submitter === "string") {
      return subscribers.has(submitter);
    }
    return subscribers.has(submitter.id);
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

  getRecentChatter: (usernameOrSubmitter: string): Chatter | null => {
    // do not purge stale entries on purpose
    for (const value of recentChatters.values()) {
      if (
        value.name === usernameOrSubmitter ||
        value.displayName === usernameOrSubmitter
      ) {
        return value;
      }
    }
    return null;
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

  notLurkingAnymore(
    usernameOrSubmitter: string | Partial<QueueSubmitter>
  ): boolean {
    lurkers.purgeStale(); // manually calling this because we are calling entries()
    let username: string | undefined;
    let displayName: string | undefined;
    if (typeof usernameOrSubmitter === "string") {
      username = usernameOrSubmitter;
      displayName = usernameOrSubmitter;
    } else {
      if (usernameOrSubmitter.id != null) {
        return lurkers.delete(usernameOrSubmitter.id);
      }
      if (usernameOrSubmitter.name != null) {
        username = usernameOrSubmitter.name;
      } else if (usernameOrSubmitter.displayName != null) {
        displayName = usernameOrSubmitter.displayName;
      } else {
        // can not remove anyone with no `id`, `name`, nor `displayName`
        return false;
      }
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
