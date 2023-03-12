const settings = require("./settings.js");
const twitch = require("./twitch.js").twitch();
const { setIntervalAsync } = require("set-interval-async/dynamic");
const persistence = require("./persistence.js");
const { Waiting } = require("./waiting.js");
const standardBase30 = "0123456789abcdefghijklmnopqrst";
const nintendoBase30 = "0123456789BCDFGHJKLMNPQRSTVWXY";
const arbitraryXorValue = 377544828;

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

const delim = "[-. ]?";
const code = "[A-Ha-hJ-Nj-nP-Yp-y0-9]{3}";
const codeStrict = "[A-Ha-hJ-Nj-nP-Yp-y0-9]{2}[fghFGH]";
const levelCodeRegex = new RegExp(
  `(${code})${delim}(${code})${delim}(${codeStrict})`
);

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

// This function returns true if the course id given to it is a valid course id. The optional parameter dataIdThresHold
// will make the function return false if the data id of the submitted level is greater than it.
// For max data id threshold, if you only want to have a max maker id threshold, send the 2nd argument as null.
/**
 * @param {string} courseIdString
 * @param {number | undefined} dataIdCourseThreshold
 * @param {number | undefined} dataIdMakerThreshold
 */
function courseIdValidity(
  courseIdString,
  dataIdCourseThreshold,
  dataIdMakerThreshold
) {
  //console.log(courseIdString);
  let reversedString = courseIdString.split("").reverse();
  reversedString = reversedString
    .map((c) => standardBase30[nintendoBase30.indexOf(c)])
    .join("");
  let courseBits = parseInt(reversedString, 30);

  let courseBitsString = courseBits.toString(2);
  if (courseBitsString.length !== 44) {
    return { valid: false, makerCode: false };
  }
  let dataId =
    parseInt(
      courseBitsString
        .substring(32, 44)
        .concat(courseBitsString.substring(10, 30)),
      2
    ) ^ arbitraryXorValue;
  let fieldA = parseInt(courseBitsString.substring(0, 4), 2);
  let fieldB = parseInt(courseBitsString.substring(4, 10), 2);
  let fieldD = parseInt(courseBitsString.substring(30, 31, 2));
  let fieldE = parseInt(courseBitsString.substring(31, 32, 2));

  if (
    fieldA !== 8 ||
    fieldB !== (dataId - 31) % 64 ||
    (fieldD == 0 && dataId < 3000004) ||
    fieldE != 1
  ) {
    return { valid: false, makerCode: fieldD == 1 };
  } else if (typeof dataIdMakerThreshold === "number" && fieldD == 1) {
    return { valid: dataId <= dataIdMakerThreshold, makerCode: true };
  } else if (typeof dataIdCourseThreshold === "number" && fieldD == 0) {
    return { valid: dataId <= dataIdCourseThreshold, makerCode: false };
  }

  return { valid: true, makerCode: fieldD == 1 };
}

const customCodes = {
  map: new Map(),
  has: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.has(customCode.toUpperCase());
  },
  getLevelCode: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.get(customCode.toUpperCase()).levelCode;
  },
  getName: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.get(customCode.toUpperCase()).customCode;
  },
  listNames: () => {
    return [...customCodes.map.values()].map((e) => e.customCode);
  },
  set: (customCodeArg, levelCode) => {
    const customCode = customCodeArg.trim();
    customCodes.map.set(customCode.toUpperCase(), { customCode, levelCode });
  },
  delete: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    customCodes.map.delete(customCode.toUpperCase());
  },
  fromCodeList: (codeList) => {
    const entries = codeList.map(([customCode, levelCode]) => [
      customCode.toUpperCase(),
      { customCode, levelCode },
    ]);
    customCodes.map = new Map(entries);
  },
  toCodeList: () => {
    return [...customCodes.map.values()].map((e) => [
      e.customCode,
      e.levelCode,
    ]);
  },
};

// this function extracts a level code found in someones message
// and returns that level code (if possible) and also checks it's validity
// the returned object will contain
// - a `code` field which either contains the found level/maker code or the original message
// - a `valid` field which will be true iff a level/maker code has the correct syntax and is one that can be generated by the game
// - and a `validSyntax` field which will be true iff a level/maker code has the correct syntax
const extractValidCode = (levelCode) => {
  if (levelCode == "R0M-HAK-LVL" && settings.romhacks_enabled) {
    return {
      code: `R0M-HAK-LVL`,
      valid: true,
      validSyntax: true,
      makerCode: false,
    };
  }

  let match = levelCode.match(levelCodeRegex);
  if (match) {
    let courseIdString = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
    let validity = courseIdValidity(
      courseIdString,
      settings.dataIdCourseThreshold,
      settings.dataIdMakerThreshold
    );
    return {
      ...validity,
      code: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
      validSyntax: true,
    };
  }
  return {
    code: levelCode,
    valid: false,
    validSyntax: false,
    makerCode: false,
  };
};

const replaceCustomCode = (levelCode) => {
  if (settings.custom_codes_enabled) {
    if (customCodes.has(levelCode)) {
      return customCodes.getLevelCode(levelCode);
    }
  }
  return levelCode;
};

const makerSuffix = (levelCode) => {
  const makerCode = extractValidCode(levelCode).makerCode;
  console.log(`"${levelCode}" -- ${makerCode}`);
  if (makerCode && settings.showMakerCode !== false) {
    return " (maker code)";
  }
  return "";
};

const displayLevel = (level) => {
  return level.code + makerSuffix(level.code);
};

const queue = {
  add: (level) => {
    if (settings.max_size && levels.length >= settings.max_size) {
      return "Sorry, the level queue is full!";
    }
    let code = extractValidCode(replaceCustomCode(level.code));
    level.code = code.code;
    if (!code.valid) {
      return level.submitter + ", that is an invalid level code.";
    }
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
      if (level.code == "R0M-HAK-LVL") {
        return level.submitter + ", your ROMhack has been added to the queue.";
      } else {
        return (
          level.submitter +
          ", " +
          displayLevel(level) +
          " has been added to the queue."
        );
      }
    } else {
      return (
        "Sorry, " +
        level.submitter +
        ", you may only submit one level at a time."
      );
    }
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
    twitch.notLurkingAnymore(level.username);
    levels = levels.filter((x) => x.submitter != level.submitter);
    queue.save();
    return usernameArgument + "'s level has been removed from the queue.";
  },

  remove: (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return "Sorry, we're playing that level right now!";
    }
    levels = levels.filter((x) => x.submitter != username);
    queue.save();
    return username + ", your level has been removed from the queue.";
  },

  replace: (username, new_level_code) => {
    let code = extractValidCode(replaceCustomCode(new_level_code));
    new_level_code = code.code;
    if (!code.valid) {
      return username + ", that level code is invalid.";
    }
    const findLevel = levels.find((x) => x.submitter == username);
    if (findLevel != undefined) {
      findLevel.code = new_level_code;
      queue.save();
      if (new_level_code == "R0M-HAK-LVL") {
        return (
          username +
          ", your level in the queue has been replaced with your ROMhack."
        );
      } else {
        return (
          username +
          ", your level in the queue has been replaced with " +
          displayLevel(findLevel) +
          "."
        );
      }
    } else if (
      current_level != undefined &&
      current_level.submitter == username
    ) {
      current_level.code = new_level_code;
      queue.save();
      if (new_level_code == "R0M-HAK-LVL") {
        return (
          username +
          ", your level in the queue has been replaced with your ROMhack."
        );
      } else {
        return (
          username +
          ", your level in the queue has been replaced with " +
          displayLevel(current_level) +
          "."
        );
      }
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
    let response =
      "Dismissed " +
      displayLevel(current_level) +
      " submitted by " +
      current_level.submitter +
      ".";
    current_level = undefined;
    queue.save();
    return response;
  },

  next: async () => {
    var list = await queue.list();
    var both = list.online.concat(list.offline);
    if (both.length === 0) {
      current_level = undefined;
      queue.save();
      return current_level;
    } else {
      current_level = both.shift();
      queue.removeWaiting();
    }
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
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
      queue.removeWaiting();
    }
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
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
      queue.removeWaiting();
    }
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  dip: (usernameArgument) => {
    var index = levels.findIndex(queue.matchUsername(usernameArgument));
    if (index != -1) {
      current_level = levels[index];
      queue.removeWaiting();
      levels.splice(index, 1);
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

  random: async () => {
    var list = await queue.list();
    var eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        queue.save();
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
    queue.removeWaiting();
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
        queue.save();
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
    queue.removeWaiting();
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
        queue.save();
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex((x) => x.submitter == current_level.submitter);
    queue.removeWaiting();
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  weightedrandom: async (list = undefined) => {
    const weightedList = await queue.weightedList(false, list);

    if (weightedList.entries.length == 0) {
      current_level = undefined;
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

    if (weightedList.entries.length == 0) {
      current_level = undefined;
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
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineUsers(settings.channel).then((online_users) => {
      online = levels.filter((x) => online_users.has(x.username));
      offline = levels.filter((x) => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline,
    };
  },

  sublist: async () => {
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineSubscribers(settings.channel).then((online_users) => {
      online = levels.filter((x) => online_users.has(x.username));
      offline = levels.filter((x) => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline,
    };
  },

  modlist: async () => {
    var online = new Array();
    var offline = new Array();
    await twitch.getOnlineMods(settings.channel).then((online_users) => {
      online = levels.filter((x) => online_users.has(x.username));
      offline = levels.filter((x) => !online_users.has(x.username));
    });
    return {
      online: online,
      offline: offline,
    };
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

  customCodeManagement: (/** @type {string}*/ codeArguments) => {
    const save = (/** @type {string} */ errorMessage) =>
      persistence.saveCustomCodesSync(customCodes.toCodeList(), errorMessage);
    let [command, ...rest] = codeArguments.split(" ");
    if (command == "add" && rest.length == 2) {
      const [customName, realName] = rest;
      const levelCode = extractValidCode(realName);
      if (!levelCode.valid) {
        return "That is an invalid level code.";
      }

      if (customCodes.has(customName)) {
        const existingName = customCodes.getName(customName);
        return `The custom code ${existingName} already exists`;
      }
      customCodes.set(customName, levelCode.code);
      save("An error occurred while trying to add your custom code.");
      return `Your custom code ${customName} for ID ${levelCode.code} has been added.`;
    } else if (command == "remove" && rest.length == 1) {
      const [customName] = rest;
      if (!customCodes.has(customName)) {
        return `The custom code ${customName} could not be found.`;
      }
      const deletedName = customCodes.getName(customName);
      const deletedLevelCode = customCodes.getLevelCode(customName);
      customCodes.delete(customName);
      save("An error occurred while trying to remove that custom code.");
      return `The custom code ${deletedName} for ID ${deletedLevelCode} has been removed.`;
    } else if (
      (command == "load" || command == "reload" || command == "restore") &&
      rest.length == 0
    ) {
      queue.loadCustomCodes();
      return "Reloaded custom codes from disk.";
    } else {
      return "Invalid arguments. The correct syntax is !customcode {add/remove/load} {customCode} {ID}.";
    }
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
      queue.loadQueueState();
      return "Reloaded queue state from disk.";
    } else {
      return "Invalid arguments. The correct syntax is !persistence {on/off/save/load}.";
    }
  },

  customCodes: () => {
    const list = customCodes.listNames();
    if (list.length == 0) {
      return "There are no custom codes set.";
    } else {
      const response = list.join(", ");
      return "The current custom codes are: " + response + ".";
    }
  },

  save: (options = {}) => {
    options = { force: false, ...options };
    if (persist || options.force) {
      return persistence.saveQueueSync(current_level, levels, waiting);
    } else {
      return false;
    }
  },

  // TODO: could be used instead of the sync variant
  //       mixing sync and async might not be a good idea
  // saveAsync: async () => {
  //   options = { force: false, ...options };
  //   if (persist || options.force) {
  //     return await persistence.saveQueue(current_level, levels, waiting);
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
  },

  loadCustomCodes: () => {
    // Check if custom codes are enabled and, if so, validate that the correct files exist.
    if (settings.custom_codes_enabled) {
      customCodes.fromCodeList(persistence.loadCustomCodesSync());
      if (settings.romhacks_enabled) {
        customCodes.has("ROMhack") || customCodes.set("ROMhack", "R0M-HAK-LVL");
        console.log("ROMhacks are enabled and allowed to be submitted.");
      } else {
        customCodes.has("ROMhack") && customCodes.delete("ROMhack");
        console.log("ROMhacks are now disabled and will not be accepted.");
      }
      persistence.saveCustomCodesSync(
        customCodes.toCodeList(),
        "An error occurred when trying to set custom codes."
      );
    }
  },

  load: () => {
    if (loaded) {
      // only reload queue state
      queue.loadQueueState();
      // do not setup the timer again or reload custom codes
      return;
    }

    // load queue state
    queue.loadQueueState();

    // load custom codes
    queue.loadCustomCodes();

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
    // TODO: use this instead?
    // await queue.saveAsync();
  },

  clear: () => {
    current_level = undefined;
    levels = new Array();
    queue.save();
  },
};

module.exports = {
  quesoqueue: () => {
    return queue;
  },
  extractValidCode,
  displayLevel,
};
