const settings = require("./settings.js");
const twitch = require("./twitch.js").twitch();
const { setIntervalAsync } = require("set-interval-async/dynamic");
const persistence = require("./persistence.js");
const { Waiting } = require("./waiting.js");
const extensions = require("./extensions.js");

/**
 * @typedef waiting
 * @property {() => number} weight
 * @property {(multiplier: number, now?: string)} addOneMinute
 *
 * @typedef level
 * @property {string} code
 * @property {string} submitter
 * @property {string} username
 *
 * @typedef onlineOfflineList
 * @property {level[]} online
 * @property {level[]} offline
 */

/** @type {boolean} */
var loaded = false;
/** @type {(level | undefined)} */
var current_level;
/** @type {level[]} */
var levels = [];
/** @type {Object.<string, waiting>} */
var waiting = {};
/** @type {boolean} */
var persist = true; // if false the queue will not save automatically

/**
 * @typedef weightedListEntry
 * @property {level} level
 * @property {() => number} weight
 * @property {number} position
 *
 * @typedef weightedList
 * @property {number} totalWeight -
 * @property {weightedListEntry[]} entries -
 * @property {number} offlineLength -
 */

const displayLevel = (level) => {
  return extensions.display(level);
};

// this implementation can be improved
const partition = (list, predicate) => {
  return [
    list.filter(predicate),
    list.filter(function () {
      return !predicate.apply(this, arguments);
    }),
  ];
};

const queue = {
  add: (level) => {
    if (settings.max_size && levels.length >= settings.max_size) {
      return "Sorry, the level queue is full!";
    }
    const resolved = extensions.resolve(level.code);
    if (resolved.entry == null) {
      // TODO: maybe display all the code types that are not valid
      return level.submitter + ", that is an invalid level code.";
    }
    level = { ...level, ...resolved.entry };
    if (
      current_level != undefined &&
      current_level.submitter == level.submitter &&
      level.submitter != settings.channel
    ) {
      return "Please wait for your level to be completed before you submit again.";
    }

    var result = levels.find((x) => x.submitter == level.submitter);
    if (result == undefined || level.submitter == settings.channel) {
      levels.push(level);
      // add wait time of 1 and add last online time of now
      if (!Object.prototype.hasOwnProperty.call(waiting, level.username)) {
        waiting[level.username] = Waiting.create();
      }
      queue.save();
      return (
        level.submitter +
        ", " +
        displayLevel(level) +
        " has been added to the queue."
      );
    } else {
      return (
        "Sorry, " +
        level.submitter +
        ", you may only submit one level at a time."
      );
    }
  },

  // this is called every time levels are removed from the queue
  // this can include the current_level
  onRemove: (removedLevels) => {
    // unlurk anyone that is removed from the queue
    removedLevels.forEach((level) => twitch.notLurkingAnymore(level.username));
    // check if romhack levels or uncleared levels are disabled and need to be removed
    const allEntries = (
      current_level === undefined ? [] : [current_level]
    ).concat(levels);
    extensions.checkEntries(allEntries);
  },

  modRemove: (usernameArgument) => {
    if (usernameArgument == "") {
      return "You can use !remove <username> to kick out someone else's level.";
    }

    var level = levels.find(queue.matchUsername(usernameArgument));
    if (!level) {
      // If the user isn't in the queue, unlurk them anyway
      // It's unlikely they'll be on BRB and not in queue, but it's an edge case worth covering
      twitch.notLurkingAnymore(usernameArgument.replace("@", "").toLowerCase());
      return "No levels from " + usernameArgument + " were found in the queue.";
    }
    let removedLevels;
    [levels, removedLevels] = partition(
      levels,
      (x) => x.submitter != level.submitter
    );
    queue.onRemove(removedLevels);
    queue.save();
    return usernameArgument + "'s level has been removed from the queue.";
  },

  remove: (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return "Sorry, we're playing that level right now!";
    }
    let removedLevels;
    [levels, removedLevels] = partition(levels, (x) => x.submitter != username);
    queue.onRemove(removedLevels);
    queue.save();
    return username + ", your level has been removed from the queue.";
  },

  replace: (username, new_level_code) => {
    const resolved = extensions.resolve(new_level_code);
    if (resolved.entry == null) {
      // TODO: maybe display all the code types that are not valid
      return username + ", that level code is invalid.";
    }
    const entry = { code: new_level_code, ...resolved.entry };
    const findLevel = levels.find((x) => x.submitter == username);
    if (findLevel != undefined) {
      Object.entries(entry).forEach(([name, value]) => {
        findLevel[name] = value;
      });
      queue.save();
      return (
        username +
        ", your level in the queue has been replaced with " +
        displayLevel(findLevel) +
        "."
      );
    } else if (
      current_level != undefined &&
      current_level.submitter == username
    ) {
      current_level = { ...current_level, ...entry };
      queue.save();
      return (
        username +
        ", your level in the queue has been replaced with " +
        displayLevel(current_level) +
        "."
      );
    } else {
      return (
        username + ", you were not found in the queue. Use !add to add a level."
      );
    }
  },

  /** @type {(username: string, list?: onlineOfflineList) => Promise<number>} */
  position: async (username, list = undefined) => {
    if (current_level != undefined && current_level.username == username) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }

    if (list === undefined) {
      list = await queue.list();
    }
    var both = list.online.concat(list.offline);
    var index = both.findIndex((x) => x.username == username);
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  /** @type {(username: string) => Promise<number>} */
  absolutePosition: async (username) => {
    if (current_level != undefined && current_level.username == username) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    var index = levels.findIndex((x) => x.username == username);
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  /** @type {(username: string, list?: onlineOfflineList) => Promise<number>} */
  weightedPosition: async (username, list = undefined) => {
    if (current_level != undefined && current_level.username == username) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    if (twitch.checkLurk(username)) {
      return -2;
    }
    const weightedList = await queue.weightedList(true, list);
    const index = weightedList.entries.findIndex(
      (x) => x.level.username == username
    );
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  submittedlevel: async (username) => {
    if (current_level != undefined && current_level.username == username) {
      return 0;
    }

    var list = await queue.list();
    var both = list.online.concat(list.offline);
    var index = both.findIndex((x) => x.username == username);
    if (index != -1) {
      return both[index];
    }
    return -1;
  },

  weightedchance: async (displayName, username) => {
    if (current_level != undefined && current_level.submitter == displayName) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    if (twitch.checkLurk(username)) {
      return -2;
    }

    const weightedList = await queue.weightedList(false);

    if (weightedList.entries.length == 0) {
      return -1;
    }

    const index = weightedList.entries.findIndex(
      (entry) => entry.level.username == username
    );

    if (index != -1) {
      console.log(
        "Elegible users: " +
          weightedList.entries
            .map((entry) => entry.level.username)
            .reduce((a, b) => a + ", " + b)
      );
      console.log(
        "Elegible users time: " +
          weightedList.entries.map((entry) => entry.weight())
      );
      const weight = weightedList.entries[index].weight();
      const totalWeight = weightedList.totalWeight;
      console.log(
        `${displayName}'s weight is ${weight} with totalWeight ${totalWeight}`
      );
      return queue.percent(weight, totalWeight);
    }
    return -1;
  },

  punt: async () => {
    if (current_level === undefined) {
      return "The nothing you aren't playing cannot be punted.";
    }
    var top = current_level;
    current_level = undefined;
    queue.add(top);
    queue.save();
    return "Ok, adding the current level back into the queue.";
  },

  dismiss: async () => {
    if (current_level === undefined) {
      return "The nothing you aren't playing cannot be dismissed.";
    }
    const response =
      "Dismissed " +
      displayLevel(current_level) +
      " submitted by " +
      current_level.submitter +
      ".";
    const removedLevels = current_level === undefined ? [] : [current_level];
    current_level = undefined;
    queue.onRemove(removedLevels);
    queue.save();
    return response;
  },

  next: async (list = undefined) => {
    if (list === undefined) {
      list = await queue.list();
    }
    const both = list.online.concat(list.offline);
    const removedLevels = current_level === undefined ? [] : [current_level];
    if (both.length === 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    } else {
      current_level = both.shift();
      queue.removeWaiting();
    }
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
    levels.splice(index, 1);
    queue.onRemove(removedLevels);
    queue.save();
    return current_level;
  },

  subnext: async () => {
    const list = await queue.sublist();
    return await queue.next(list);
  },

  modnext: async () => {
    const list = await queue.modlist();
    return await queue.next(list);
  },

  dip: (usernameArgument) => {
    const index = levels.findIndex(queue.matchUsername(usernameArgument));
    if (index != -1) {
      const removedLevels = current_level === undefined ? [] : [current_level];
      current_level = levels[index];
      queue.removeWaiting();
      levels.splice(index, 1);
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }
    return undefined;
  },

  removeWaiting: () => {
    if (Object.prototype.hasOwnProperty.call(waiting, current_level.username)) {
      delete waiting[current_level.username];
    }
  },

  current: () => {
    return current_level;
  },

  random: async (list = undefined) => {
    if (list === undefined) {
      list = await queue.list();
    }
    const removedLevels = current_level === undefined ? [] : [current_level];
    let eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        queue.onRemove(removedLevels);
        queue.save();
        return current_level;
      }
    }

    const random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    const index = levels.findIndex(
      (x) => x.submitter == current_level.submitter
    );
    queue.removeWaiting();
    levels.splice(index, 1);
    queue.onRemove(removedLevels);
    queue.save();
    return current_level;
  },

  subrandom: async () => {
    const list = await queue.sublist();
    return await queue.random(list);
  },

  modrandom: async () => {
    const list = await queue.modlist();
    return await queue.random(list);
  },

  weightedrandom: async (list = undefined) => {
    const weightedList = await queue.weightedList(false, list);
    const removedLevels = current_level === undefined ? [] : [current_level];

    if (weightedList.entries.length == 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }

    const totalWeight = weightedList.totalWeight;
    const randomNumber = Math.floor(Math.random() * totalWeight) + 1;
    let levelIndex = 0;
    let gettingThereSomeday = weightedList.entries[0].weight();

    console.log(
      "Elegible users: " +
        weightedList.entries
          .map((entry) => entry.level.username)
          .reduce((a, b) => a + ", " + b)
    );
    console.log(
      "Elegible users time: " +
        weightedList.entries.map((entry) => entry.weight())
    );

    console.log("Random number: " + randomNumber);
    console.log("Current cumulative time: " + gettingThereSomeday);
    while (gettingThereSomeday < randomNumber) {
      levelIndex++;
      gettingThereSomeday =
        gettingThereSomeday + weightedList.entries[levelIndex].weight();
      console.log("Current cumulative time: " + gettingThereSomeday);
    }

    console.log(
      "Chosen index was " +
        levelIndex +
        " after a cumulative time of " +
        gettingThereSomeday
    );
    current_level = weightedList.entries[levelIndex].level;

    const index = levels.findIndex((x) => x.username == current_level.username);
    levels.splice(index, 1);

    const selectionChance = queue.percent(
      weightedList.entries[levelIndex].weight(),
      totalWeight
    );

    queue.removeWaiting();
    queue.onRemove(removedLevels);
    queue.save();

    return { ...current_level, selectionChance };
  },

  /** @type {(sorted?: boolean, list?: onlineOfflineList) => Promise<weightedList>} */
  weightedList: async (sorted = undefined, list = undefined) => {
    if (list === undefined) {
      list = await queue.list();
    }
    const online_users = list.online;
    if (online_users.length == 0 || Object.keys(waiting).length == 0) {
      return {
        totalWeight: 0,
        entries: [],
        offlineLength: list.offline.length + online_users.length,
      };
    }

    let entries = online_users
      .filter((level) =>
        Object.prototype.hasOwnProperty.call(waiting, level.username)
      )
      .map((level, position) => {
        return {
          weight: () => waiting[level.username].weight(),
          position: position,
          level: level,
        };
      });

    if (sorted === undefined || sorted) {
      entries = entries.sort(
        (a, b) => b.weight() - a.weight() || a.position - b.position
      );
    }

    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight(), 0);

    return {
      totalWeight: totalWeight,
      entries: entries,
      offlineLength:
        list.offline.length + (online_users.length - entries.length),
    };
  },

  percent: (weight, totalWeight) => {
    let percent = (weight / totalWeight) * 100.0;
    if (percent > 100.0) {
      percent = 100.0;
    } else if (isNaN(percent) || percent < 0.0) {
      percent = 0.0;
    }
    const percentString = percent.toFixed(1);
    if (percentString === "100.0" && weight != totalWeight) {
      return ">99.9";
    }
    if (percentString === "0.0" && weight != 0) {
      return "<0.1";
    }
    return percentString;
  },

  multiplier: (username) => {
    if (settings.subscriberWeightMultiplier && twitch.isSubscriber(username)) {
      return settings.subscriberWeightMultiplier;
    }
    return 1.0;
  },

  weightednext: async (list = undefined) => {
    const weightedList = await queue.weightedList(true, list);
    const removedLevels = current_level === undefined ? [] : [current_level];

    if (weightedList.entries.length == 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }

    current_level = weightedList.entries[0].level;

    // index of the level can be different than 0
    const index = levels.findIndex((x) => x.username == current_level.username);
    levels.splice(index, 1);

    let selectionChance = queue.percent(
      weightedList.entries[0].weight(),
      weightedList.totalWeight
    );

    queue.removeWaiting();
    queue.onRemove(removedLevels);
    queue.save();

    return { ...current_level, selectionChance };
  },

  weightedsubrandom: async () => {
    const list = await queue.sublist();
    return await queue.weightedrandom(list);
  },

  weightedsubnext: async () => {
    const list = await queue.sublist();
    return await queue.weightednext(list);
  },

  /** @type {() => Promise<onlineOfflineList> } */
  list: async () => {
    let online = [];
    let offline = [];
    await twitch.getOnlineUsers(settings.channel).then((online_users) => {
      [online, offline] = partition(levels, (x) =>
        online_users.has(x.username)
      );
    });
    return { online, offline };
  },

  sublist: async () => {
    let online = [];
    let offline = [];
    await twitch.getOnlineSubscribers(settings.channel).then((online_users) => {
      [online, offline] = partition(levels, (x) =>
        online_users.has(x.username)
      );
    });
    return { online, offline };
  },

  modlist: async () => {
    let online = [];
    let offline = [];
    await twitch.getOnlineMods(settings.channel).then((online_users) => {
      [online, offline] = partition(levels, (x) =>
        online_users.has(x.username)
      );
    });
    return { online, offline };
  },

  matchUsername: (usernameArgument) => {
    usernameArgument = usernameArgument.trim().replace(/^@/, "");
    return (level) => {
      // display name (submitter) or user name (username) matches
      return (
        level.submitter == usernameArgument ||
        level.username == usernameArgument
      );
    };
  },
  persistenceManagement: async (/** @type {string}*/ subCommand) => {
    if (subCommand == "on") {
      persist = true;
      return "Activated automatic queue persistence.";
    } else if (subCommand == "off") {
      persist = false;
      return "Deactivated automatic queue persistence.";
    } else if (subCommand == "save") {
      // force save
      const success = queue.save({ force: true });
      if (success) {
        return "Successfully persisted the queue state.";
      } else {
        return "Error while persisting queue state, see logs.";
      }
    } else if (
      subCommand == "load" ||
      subCommand == "reload" ||
      subCommand == "restore"
    ) {
      // load queue state
      queue.loadQueueState();
      return "Reloaded queue state from disk.";
    } else {
      return "Invalid arguments. The correct syntax is !persistence {on/off/save/load}.";
    }
  },

  save: (options = {}) => {
    options = { force: false, ...options };
    if (persist || options.force) {
      return persistence.saveQueueSync({
        currentLevel: current_level,
        queue: levels,
        waiting,
        // TODO: add test case to check that only data and version are persisted
        extensions: Object.fromEntries(
          Object.entries(extensions.getQueueBindings()).map(([key, value]) => {
            return [key, { data: value.data, version: value.version }];
          })
        ),
      });
    } else {
      return false;
    }
  },

  // TODO: could be used instead of the sync variant
  //       mixing sync and async might not be a good idea
  //       as well as test cases not working correctly any more
  // saveAsync: async (options = {}) => {
  //   options = { force: false, ...options };
  //   if (persist || options.force) {
  //     return await persistence.saveQueue({
  //       currentLevel: current_level,
  //       queue: levels,
  //       waiting,
  //       extensions: extensions.getQueueBindings(),
  //     });
  //   } else {
  //     return false;
  //   }
  // },

  isPersisting: () => {
    return persist;
  },

  loadQueueState: () => {
    const state = persistence.loadQueueSync();
    current_level = state.currentLevel;
    levels = state.queue;
    // split waiting map into lists
    waiting = state.waiting;

    extensions.overrideQueueBindings(state.extensions);

    // check levels
    let save = false;
    const allEntries = (
      current_level === undefined ? [] : [current_level]
    ).concat(levels);
    save |= extensions.upgradeEntries(allEntries);
    save |= extensions.checkEntries(allEntries);
    if (save) {
      queue.save();
    }
  },

  handleCommands: async (message, sender, respond) => {
    return await extensions.handleCommands(message, sender, respond);
  },

  load: () => {
    if (loaded) {
      // only reload queue state
      queue.loadQueueState();
      // do not setup the timer again or reload custom codes
      return;
    }

    // load extensions
    extensions.load();

    // load queue state
    queue.loadQueueState();

    // Start the waiting time timer
    setIntervalAsync(queue.waitingTimerTick, 60000);

    loaded = true;
  },

  waitingTimerTick: async () => {
    var list = await queue.list();
    const now = new Date().toISOString();
    list.online
      .map((v) => v.username)
      .forEach((username) => {
        if (Object.prototype.hasOwnProperty.call(waiting, username)) {
          waiting[username].addOneMinute(queue.multiplier(username), now);
        } else {
          waiting[username] = Waiting.create(now);
        }
      });
    queue.save();
    // TODO: use this instead? (see comment of queue.saveAsync)
    // await queue.saveAsync();
  },

  clear: () => {
    current_level = undefined;
    const removedLevels = levels;
    levels = [];
    queue.onRemove(removedLevels);
    queue.save();
  },
};

module.exports = {
  quesoqueue: () => {
    return queue;
  },
  displayLevel,
};
