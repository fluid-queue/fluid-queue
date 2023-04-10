import { Chatter } from "./extensions";
import { twitchApi } from "./twitch-api";

const recent_chatters: Record<string, number> = {};
const subscribers = new Set();
const mods = new Set();
const lurkers = new Set<string>();

const twitch = {
  getOnlineUsers: async (forceRefresh: boolean) => {
    const online_users = new Set<string>();
    const chatters = await twitchApi.getChatters(forceRefresh);
    chatters.forEach((chatter) => online_users.add(chatter.userName));
    const current_time = Date.now();
    Object.keys(recent_chatters)
      .filter(
        (x) => current_time - recent_chatters[x] < Math.floor(1000 * 60 * 5)
      )
      .forEach((x) => online_users.add(x));
    return new Set<string>([...online_users].filter((x) => !lurkers.has(x)));
  },

  isSubscriber: (username: string) => {
    return subscribers.has(username);
  },

  getOnlineSubscribers: async (forceRefresh: boolean) => {
    const online_users = await twitch.getOnlineUsers(forceRefresh);
    return new Set([...online_users].filter((x) => subscribers.has(x)));
  },

  getOnlineMods: async (forceRefresh: boolean) => {
    const online_users = await twitch.getOnlineUsers(forceRefresh);
    return new Set([...online_users].filter((x) => mods.has(x)));
  },

  noticeChatter: (chatter: Chatter) => {
    const current_time = Date.now();
    recent_chatters[chatter.username] = current_time;
    if (chatter.isSubscriber) {
      subscribers.add(chatter.username);
    }
    if (chatter.isMod) {
      mods.add(chatter.username);
    }
  },

  setToLurk: (username: string) => {
    lurkers.add(username);
  },

  checkLurk: (username: string) => {
    if (lurkers.has(username)) {
      return true;
    } else {
      return false;
    }
  },

  notLurkingAnymore: (username: string) => {
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

export { twitch };
