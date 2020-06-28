const fetch = require("node-fetch");

var recent_chatters = {};
var lurkers = new Set();

const twitch = {
  getOnlineUsers: async (channel) => {
    const channel_url = "https://tmi.twitch.tv/group/user/" + channel + "/chatters";
    var online_users = new Set();

    await fetch(channel_url).then(res => res.json()).then(x => Object.keys(x.chatters).forEach(y => x.chatters[y].forEach(z => online_users.add(z))));

    var current_time = Date.now();
    Object.keys(recent_chatters).filter(x => current_time - recent_chatters[x] < Math.floor(1000 * 60 * 5)).forEach(x => online_users.add(x));

    return new Set([...online_users].filter(x => !lurkers.has(x)));
  },

  markAsOnline: (username) => {
    var current_time = Date.now();
    recent_chatters[username] = current_time;
  },

  setToLurk: (username) => {
   lurkers.add(username);
  },

  notLurkingAnymore: (username) => {
   if (lurkers.has(username)) {
     lurkers.delete(username);
     return true;
   }
   return false;
  }
};

module.exports = {
  twitch: () => { return twitch; }
};
