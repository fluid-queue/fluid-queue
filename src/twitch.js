const fetch = require("node-fetch");

var recent_chatters = {};
var subscribers = new Set();
var mods = new Set();
var lurkers = new Set();
var lastOnlineUsers;

const twitch = {
  getOnlineUsers: async (channel) => {
    const channel_url = "https://tmi.twitch.tv/group/user/" + channel + "/chatters";
    var online_users = new Set();
    try {
      await fetch(channel_url).then(res => res.json()).then(x => Object.keys(x.chatters).forEach(y => x.chatters[y].forEach(z => online_users.add(z))));
      lastOnlineUsers = online_users;
    } catch (error) {
      if (typeof lastOnlineUsers !== 'undefined') {
        online_users = lastOnlineUsers;
        console.log('Error with getting online users. Using old list.');
      } else {
        console.log('Error with getting online users. Using recent chatters due to there being no available old list.');
      }
    }
    var current_time = Date.now();
    Object.keys(recent_chatters).filter(x => current_time - recent_chatters[x] < Math.floor(1000 * 60 * 5)).forEach(x => online_users.add(x));
    return new Set([...online_users].filter(x => !lurkers.has(x)));
  },

  isSubscriber: (username) => {
    return subscribers.has(username);
  },

  getOnlineSubscribers: async (channel) => {
    var online_users = await twitch.getOnlineUsers(channel);
    return new Set([...online_users].filter(x => subscribers.has(x)));
  },

  getOnlineMods: async (channel) => {
    var online_users = await twitch.getOnlineUsers(channel);
    return new Set([...online_users].filter(x => mods.has(x)));
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

  getWaitTime: async (chatter) => {

  }
};



module.exports = {
  twitch: () => { return twitch; }
};
