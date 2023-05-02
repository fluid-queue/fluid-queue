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
  submitters: User[];
  id: Set<string>;
  name: Set<string>;
  displayName: Set<string>;
  hasSubmitter(submitter: Partial<User>): boolean;
}

function createOnlineUsers(
  userNamesSet: User[] | OnlineUsers,
  filter?: (submitter: User) => boolean
): OnlineUsers {
  const users = (
    Array.isArray(userNamesSet) ? userNamesSet : userNamesSet.submitters
  ).filter(filter ?? (() => true));
  const id: Set<string> = new Set();
  const name: Set<string> = new Set();
  const displayName: Set<string> = new Set();
  for (const user of users) {
    if (user.id !== undefined) {
      id.add(user.id);
    }
    if (user.name !== undefined) {
      name.add(user.name);
    }
    if (user.displayName !== undefined) {
      displayName.add(user.displayName);
    }
  }
  return {
    id,
    name,
    displayName,
    submitters: users,
    hasSubmitter(submitter) {
      if (submitter.id !== undefined && id.has(submitter.id)) {
        return true;
      }
      if (submitter.name !== undefined && name.has(submitter.name)) {
        return true;
      }
      if (
        submitter.displayName !== undefined &&
        displayName.has(submitter.displayName)
      ) {
        return true;
      }
      return false;
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
