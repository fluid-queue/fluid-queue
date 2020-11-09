const settings = require('./settings.js');
const twitch = require('./twitch.js').twitch();
const fs = require('fs');

var current_level = undefined;
var levels = new Array();
const cache_filename = "queso.save";

const isValidLevelCode = (level_code) => {
  const level_bit = '[A-Ha-hJ-Nj-nP-Yp-y0-9]{3}';
  const delim_bit = '[-. ]?';
  const valid_level_code = level_bit + delim_bit + level_bit + delim_bit + level_bit;
  return level_code.match(valid_level_code);
};

const queue = {
  add: (level) => {
    if (levels.length >= settings.max_size) {
      return "full";
    }
    if (!isValidLevelCode(level.code)) {
      return "invalid";
    }
    if (current_level != undefined && current_level.submitter == level.submitter && level.submitter != settings.channel) {
      return "current";
    }

    var result = levels.find(x => x.submitter == level.submitter);
    if (result == undefined || level.submitter == settings.channel) {
      levels.push(level);
      queue.save();
      return "added";
    } else {
      return "limit";
    }
  },

  modRemove: (username) => {
    if (username == '') {
      return undefined;
    }
    var old_level = levels.find(x => x.submitter == username);
    levels = levels.filter(x => x.submitter != username);
    return { username, ...old_level };
  },

  remove: (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return undefined;
    }
    var old_level = levels.find(x => x.submitter == username);
    levels = levels.filter(x => x.submitter != username);
    return { username, ...old_level };
  },

  replace: (username, new_level_code) => {
    if (!isValidLevelCode(new_level_code)) {
      return "invalid";
    }
    var old_level = levels.find(x => x.submitter == username);
    if (old_level != undefined) {
      old_level.code = new_level_code;
      queue.save();
      return "replaced";
    } else if (current_level != undefined && current_level.submitter == username) {
      current_level.code = new_level_code;
      queue.save();
      return "replacedCurrent";
    } else {
      return "unavailable";
    }
  },

  position: async (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }

    var list = await queue.list();
    var both = list.online.concat(list.offline);
    var index = both.findIndex(x => x.submitter == username);
    if (index != -1) {
      return (index + 1) + ((current_level != undefined) ? 1 : 0);
    }
    return -1;
  },

  punt: async () => {
    if (current_level === undefined) {
      return undefined;
    }
    var top = current_level;
    current_level = undefined;
    queue.add(top);
    return top;
  },

  next: async () => {
    var list = await queue.list();
    var both = list.online.concat(list.offline);
    if (both.length === 0) {
      current_level = undefined;
    } else {
      current_level = both.shift();
    }
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  subnext: async () => {
    var list = await queue.sublist();
    var both = list.online.concat(list.offline);
    if (both.length === 0) {
      current_level = undefined;
    } else {
      current_level = both.shift();
    }
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  modnext: async () => {
    var list = await queue.modlist();
    var both = list.online.concat(list.offline);
    if (both.length === 0) {
      current_level = undefined;
    } else {
      current_level = both.shift();
    }
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  dip: (username) => {
    var index = levels.findIndex(x => x.submitter == username);
    if (index != -1) {
      current_level = levels[index];
      levels.splice(index, 1);
      queue.save();
      return current_level;
    }
    return undefined;
  },

  current: () => {
    return current_level;
  },

  random: async () => {
    var list = await queue.list();
    var eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  subrandom: async () => {
    var list = await queue.sublist();
    var eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  modrandom: async () => {
    var list = await queue.modlist();
    var eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.code == current_level.code);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  list: async () => {
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineUsers(settings.channel).then(online_users => {
      online = levels.filter(x => online_users.has(x.username));
      offline = levels.filter(x => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline
    };
  },

  sublist: async () => {
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineSubscribers(settings.channel).then(online_users => {
      online = levels.filter(x => online_users.has(x.username));
      offline = levels.filter(x => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline
    };
  },

  modlist: async () => {
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineMods(settings.channel).then(online_users => {
      online = levels.filter(x => online_users.has(x.username));
      offline = levels.filter(x => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline
    };
  },

  save: () => {
    var levels_to_save = levels;
    if (current_level != undefined) {
      levels_to_save = [current_level].concat(levels_to_save);
    }
    var new_data = JSON.stringify(levels_to_save, null, 2);
    fs.writeFileSync(cache_filename, new_data);
  },

  load: () => {
    if (fs.existsSync(cache_filename)) {
      var raw_data = fs.readFileSync(cache_filename);
      levels = JSON.parse(raw_data);
      const username_missing = level => !level.hasOwnProperty('username');
      if (levels.some(username_missing)) {
        console.warn(`Usernames are not set in the file ${cache_filename}!`);
        console.warn('Assuming that usernames are lowercase Display Names which does work with Localized Display Names.');
        console.warn('To be safe, clear the queue with !clear.');
        levels.forEach(level => {
          if (username_missing(level)) {
            level.username = level.submitter.toLowerCase();
          }
        });
      }
      current_level = undefined;
    }
  },

  clear: () => {
    current_level = undefined;
    levels = new Array();
    queue.save();
  }
};

module.exports = {
  quesoqueue: () => { return queue; }
};
