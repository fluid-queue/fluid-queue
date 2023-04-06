const { twitchApi } = require("./twitch-api.js");

var recent_chatters = {};
var subscribers = new Set();
var mods = new Set();
var lurkers = new Set();

const twitch = {
  getOnlineUsers: async (options = {}) => {
    options = { forceRefresh: false, ...options };
    var online_users = new Set();
    const chatters = await twitchApi.getChatters(options.forceRefresh);
    chatters.forEach((chatter) => online_users.add(chatter.userName));
    var current_time = Date.now();
    Object.keys(recent_chatters)
      .filter(
        (x) => current_time - recent_chatters[x] < Math.floor(1000 * 60 * 5)
      )
      .forEach((x) => online_users.add(x));
    return new Set([...online_users].filter((x) => !lurkers.has(x)));
  },

  isSubscriber: (username) => {
    return subscribers.has(username);
  },

  getOnlineSubscribers: async (options = {}) => {
    var online_users = await twitch.getOnlineUsers(options);
    return new Set([...online_users].filter((x) => subscribers.has(x)));
  },

  getOnlineMods: async (options = {}) => {
    var online_users = await twitch.getOnlineUsers(options);
    return new Set([...online_users].filter((x) => mods.has(x)));
  },

  noticeChatter: (chatter) => {
    var current_time = Date.now();
    recent_chatters[chatter.username] = current_time;
    if (chatter.isSubscriber) {
      subscribers.add(chatter.username);
    }
    if (chatter.isMod) {
      mods.add(chatter.username);
    }
  },

  setToLurk: (username) => {
    lurkers.add(username);
  },

  checkLurk: (username) => {
    if (lurkers.has(username)) {
      return true;
    } else {
      return false;
    }
  },

  notLurkingAnymore: (username) => {
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

module.exports = {
  twitch: () => {
    return twitch;
  },
};
