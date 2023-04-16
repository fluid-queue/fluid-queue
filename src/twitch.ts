import { Chatter } from "./extensions-api/command.js";
import { QueueSubmitter } from "./extensions-api/queue-entry.js";
import { twitchApi } from "./twitch-api.js";

const recent_chatters: Record<string, number> = {};
const subscribers = new Set();
const mods = new Set();
const lurkers = new Set<string>();

export interface OnlineUsers {
  submitters: Partial<QueueSubmitter>[];
  id: Set<string>;
  login: Set<string>;
  hasSubmitter(submitter: Partial<QueueSubmitter>): boolean;
}

function createOnlineUsers(
  userNamesSet: Set<string> | OnlineUsers,
  filter?: (submitter: Partial<QueueSubmitter>) => boolean
): OnlineUsers {
  const users = (
    userNamesSet instanceof Set ? [...userNamesSet] : userNamesSet.submitters
  )
    .flatMap((userName) => {
      if (typeof userName === "string") {
        return { login: userName };
      } else {
        return userName;
      }
    })
    .filter(filter ?? (() => true));
  const id: Set<string> = new Set();
  const login: Set<string> = new Set();
  for (const user of users) {
    if (user.id !== undefined) {
      id.add(user.id);
    }
    if (user.login !== undefined) {
      login.add(user.login);
    }
  }
  return {
    id,
    login,
    submitters: users,
    hasSubmitter(submitter) {
      if (submitter.id !== undefined && id.has(submitter.id)) {
        return true;
      }
      if (submitter.login !== undefined && login.has(submitter.login)) {
        return true;
      }
      return false;
    },
  };
}

const twitch = {
  async getOnlineUsers(forceRefresh = false): Promise<OnlineUsers> {
    const online_users = new Set<string>();
    const chatters = await twitchApi.getChatters(forceRefresh);
    chatters.forEach((chatter) => online_users.add(chatter.userName));
    const current_time = Date.now();
    Object.keys(recent_chatters)
      .filter(
        (x) => current_time - recent_chatters[x] < Math.floor(1000 * 60 * 5)
      )
      .forEach((x) => online_users.add(x));
    return createOnlineUsers(
      new Set<string>([...online_users].filter((x) => !lurkers.has(x)))
    );
  },

  isSubscriber: (submitter: QueueSubmitter | string) => {
    if (typeof submitter === "string") {
      return subscribers.has(submitter);
    }
    return subscribers.has(submitter.login);
  },

  async getOnlineSubscribers(forceRefresh = false): Promise<OnlineUsers> {
    const onlineUsers = await twitch.getOnlineUsers(forceRefresh);
    return createOnlineUsers(onlineUsers, (submitter) =>
      subscribers.has(submitter.login)
    );
  },

  async getOnlineMods(forceRefresh = false): Promise<OnlineUsers> {
    const onlineUsers = await twitch.getOnlineUsers(forceRefresh);
    return createOnlineUsers(onlineUsers, (submitter) =>
      mods.has(submitter.login)
    );
  },

  noticeChatter: (submitter: Chatter) => {
    const current_time = Date.now();
    recent_chatters[submitter.login] = current_time;
    if (submitter.isSubscriber) {
      subscribers.add(submitter.login);
    }
    if (submitter.isMod) {
      mods.add(submitter.login);
    }
  },

  setToLurk: (submitter: QueueSubmitter) => {
    lurkers.add(submitter.login);
  },

  checkLurk: (usernameOrSubmitter: string | Partial<QueueSubmitter>) => {
    let username: string;
    if (typeof usernameOrSubmitter === "string") {
      username = usernameOrSubmitter;
    } else {
      if (usernameOrSubmitter.login != null) {
        username = usernameOrSubmitter.login;
      } else if (usernameOrSubmitter.displayName != null) {
        // best effort for now!
        username = usernameOrSubmitter.displayName.toLowerCase();
      } else {
        // can not remove anyone with only `id` or no information
        return false;
      }
    }

    if (lurkers.has(username)) {
      return true;
    } else {
      return false;
    }
  },

  notLurkingAnymore(
    usernameOrSubmitter: string | Partial<QueueSubmitter>
  ): boolean {
    let username: string;
    if (typeof usernameOrSubmitter === "string") {
      username = usernameOrSubmitter;
    } else {
      if (usernameOrSubmitter.login != null) {
        username = usernameOrSubmitter.login;
      } else if (usernameOrSubmitter.displayName != null) {
        // best effort for now!
        username = usernameOrSubmitter.displayName.toLowerCase();
      } else {
        // can not remove anyone with only `id` or no information
        return false;
      }
    }

    if (lurkers.has(username)) {
      lurkers.delete(username);
      return true;
    }
    return false;
  },

  clearLurkers: () => {
    lurkers.clear();
  },
};

type Twitch = typeof twitch;

export { twitch, Twitch };
