const settings = require('./settings.js');
const twitch = require('./twitch.js').twitch();
const fs = require('fs');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const standardBase30 = '0123456789abcdefghijklmnopqrst'
const nintendoBase30 = '0123456789BCDFGHJKLMNPQRSTVWXY'
const arbitraryXorValue = 377544828

var current_level = undefined;
var levels = new Array()
var waitingUsers;
var userWaitTime;
var customCodesMap = new Map();
const cache_filename = "queso.save";

const delim = '[-. ]?';
const code = '[A-Ha-hJ-Nj-nP-Yp-y0-9]{3}';
const codeStrict = '[A-Ha-hJ-Nj-nP-Yp-y0-9]{2}[fghFGH]';
const levelCodeRegex = new RegExp(`(${code})${delim}(${code})${delim}(${codeStrict})`);

// Check if files for waitingUsers and/or userWaitTime exists, and if they are readable using JSON.parse()
if (fs.existsSync('./waitingUsers.txt')) {
  try {
    waitingUsers = JSON.parse(fs.readFileSync('./waitingUsers.txt'));
    console.log('waitingUsers.txt has been successfully validated.');
  } catch (err) {
    fs.writeFileSync('waitingUsers.txt', '[]', (err) => {
      if (err) {
        console.warn('An error occurred when trying to prepare waitingUsers.txt. Weighted chance will not function.');
        return;
      }
      waitingUsers = JSON.parse(fs.readFileSync('./waitingUsers.txt'));
      console.log('waitingUsers.txt has been successfully updated and validated.');
    });
  }
} else {
  fs.writeFileSync('waitingUsers.txt', '[]', (err) => {
    if (err) {
      console.warn('An error occurred when trying to create waitingUsers.txt. Weighted chance will not function.');
      return;
    }
    console.log('waitingUsers.txt has been successfully created and validated.');
  });
}

if (fs.existsSync('./userWaitTime.txt')) {
  try {
    userWaitTime = JSON.parse(fs.readFileSync('./userWaitTime.txt'));
    console.log('userWaitTime.txt has been successfully validated.');
  } catch (err) {
    fs.writeFileSync('userWaitTime.txt', '[]', (err) => {
      if (err) {
        console.warn('An error occurred when trying to prepare userWaitTime.txt. Weighted chance will not function.');
        return;
      }
      userWaitTime = JSON.parse(fs.readFileSync('./userWaitTime.txt'));
      console.log('userWaitTime.txt has been successfully updated and validated.');
    });
  }
} else {
  fs.writeFileSync('userWaitTime.txt', '[]', (err) => {
    if (err) {
      console.warn('An error occurred when trying to create userWaitTime.txt. Weighted chance will not function.');
      return;
    }
    console.log('userWaitTime.txt has been successfully created and validated.');
  });
}

// Check if custom codes are enabled and, if so, validate that the correct files exist.
if (settings.custom_codes_enabled) {
  let baseMap = new Map();
  if (fs.existsSync('./customCodes.json')) {
    try {
      customCodesMap = new Map(JSON.parse(fs.readFileSync('./customCodes.json')));
      console.log('customCodes.json has been successfully validated.');
    } catch (err) {
      fs.writeFileSync('customCodes.json', JSON.stringify(Array.from(baseMap.entries())), (err) => {
        if (err) {
          console.warn('An error occurred when trying to prepare customCodes.json. Custom codes will not function.');
          return;
        }
        customCodesMap = new Map(JSON.parse(fs.readFileSync('./customCodes.json')));
        console.log('customCodes.json has been successfully updated and validated.');
      });
    }
  } else {
    fs.writeFileSync('customCodes.json', JSON.stringify(Array.from(baseMap.entries())), (err) => {
      if (err) {
        console.warn('An error occurred when trying to create customCodes.json. Custom codes will not function.');
        return;
      }
      customCodesMap = new Map(JSON.parse(fs.readFileSync('./customCodes.json')));
      console.log('customCodes.json has been successfully created and validated.');
    });
  }
}

  // Check if romhacks are enabled and, if so, ensure that the romhack key exists in the custom codes.
  if (settings.romhacks_enabled && settings.custom_codes_enabled) {
    if (customCodesMap.has('ROMhack')) {
      console.log('ROMhacks are enabled and allowed to be submitted.');
    } else {
      customCodesMap.set('ROMhack', 'R0M-HAK-LVL');
      fs.writeFileSync('customCodes.json', JSON.stringify(Array.from(customCodesMap.entries())), (err) => {
        if (err) {
          console.warn("An error occurred when trying to enable ROMhacks. The queue will not accept ROMhacks as a result.");
        }
      });
      console.log('ROMhacks are enabled and allowed to be submitted.');
    }
  } else if (settings.custom_codes_enabled) {
    if (!customCodesMap.has('ROMhack')) {
      // Don't do anything, no need to alert the user.
    } else {
      customCodesMap.delete('ROMhack');
      fs.writeFileSync('customCodes.json', JSON.stringify(Array.from(customCodesMap.entries())), (err) => {
        if (err) {
          console.warn("An error occurred when trying to disable ROMhacks. The queue will continue to accept ROMhacks as a result.");
        }
      });
      console.log('ROMhacks are now disabled and will not be accepted.');
    }
  }

// This function returns true if the course id given to it is a valid course id. The optional parameter dataIdThresHold
// will make the function return false if the data id of the submitted level is greater than it.
// For max data id threshold, if you only want to have a max maker id threshold, send the 2nd argument as null.
function courseIdValidity(courseIdString, dataIdCourseThreshold, dataIdMakerThreshold)
{
  //console.log(courseIdString);
  let reversedString = courseIdString.split("").reverse()
  reversedString = reversedString.map(c => standardBase30[nintendoBase30.indexOf(c)]).join('')
  let courseBits = parseInt(reversedString, 30)

  let courseBitsString = courseBits.toString(2)
  if (courseBitsString.length !== 44)
  {
    return false
  }
  let dataId = parseInt(courseBitsString.substring(32, 44).concat((courseBitsString.substring(10, 30))),2) ^ arbitraryXorValue
  let fieldA = parseInt(courseBitsString.substring(0, 4),2)
  let fieldB = parseInt(courseBitsString.substring(4, 10),2)
  let fieldD = parseInt(courseBitsString.substring(30, 31,2))
  let fieldE = parseInt(courseBitsString.substring(31, 32,2))

  if (fieldA !== 8 || fieldB !== (dataId - 31) % 64 || (fieldD == 0 && dataId < 3000004) || fieldE != 1)
  {
    return false
  }
  else if (typeof dataIdMakerThreshold === 'number' && fieldD == 1)
  {
    return dataId <= dataIdMakerThreshold;
  }
  else if (typeof dataIdCourseThreshold === 'number' && fieldD == 0)
  {
    return dataId <= dataIdCourseThreshold;
  }

  return true;
}

// this function extracts a level code found in someones message
// and returns that level code (if possible) and also checks it's validity
// the returned object will contain
// - a `code` field which either contains the found level/maker code or the original message
// - a `valid` field which will be true iff a level/maker code has the correct syntax and is one that can be generated by the game
// - and a `validSyntax` field which will be true iff a level/maker code has the correct syntax
const extractValidCode = (levelCode) => {
  if ((levelCode == 'R0M-HAK-LVL') && (settings.romhacks_enabled)) {
    return { code: `R0M-HAK-LVL`, valid: true, validSyntax: true };
  }

  let match = levelCode.match(levelCodeRegex);
  if (match) {
    let courseIdString = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
    let validity = courseIdValidity(courseIdString, settings.dataIdCourseThreshold, settings.dataIdMakerThreshold);
    return { code: `${match[1]}-${match[2]}-${match[3]}`, valid: validity, validSyntax: true };
  }
  return { code: levelCode, valid: false, validSyntax: false };
}

// Waiting time timer
setIntervalAsync(
  async () => {
    var list = await queue.list();
    for (let i = 0; i < list.online.length; i++) {
      if (!waitingUsers.includes(list.online[i].username)) {
        waitingUsers.push(list.online[i].username);
        userWaitTime.push(1);
      } else {
        let userIndex = waitingUsers.indexOf(list.online[i].username);
        userWaitTime[userIndex] = userWaitTime[userIndex] + 1;
      }
    }
    fs.writeFileSync('./waitingUsers.txt', JSON.stringify(waitingUsers));
    fs.writeFileSync('./userWaitTime.txt', JSON.stringify(userWaitTime));
  },
  60000
)

 async function selectionchance(displayName, username) {
  var list = await queue.list();
  var online_users = list.online;

  if (current_level === undefined) {
    return 0;
  }

  var elegible_users = new Array();
  for (let i = 0; i < online_users.length; i++) {
    if (waitingUsers.includes(online_users[i].username)) {
      elegible_users.push(online_users[i])
    }
  }
  var elegible_users_time = new Array();
  for (let i = 0; i < elegible_users.length; i++) {
    elegible_users_time.push(userWaitTime[waitingUsers.indexOf(elegible_users[i].username)]);
  }

  var userIndex = waitingUsers.indexOf(current_level.username);
  var userChance = userWaitTime[userIndex];
  var totalOdds = elegible_users_time.reduce((a, b) => a + b, 0) + userChance;
  var chance = (userChance / totalOdds * 100).toFixed(1);

console.log("userWait time is " + userChance + " and the total odds are " + totalOdds);

  if (chance > 100.0) {
    return 100.0;
  } else {
    return chance;
  }
};

const queue = {
  add: (level) => {
    if (levels.length >= settings.max_size) {
      return "Sorry, the level queue is full!";
    }
    let code = extractValidCode(level.code);
    level.code = code.code;
    if (!code.valid) {
      return level.submitter + ", that is an invalid level code.";
    }
    if (current_level != undefined && current_level.submitter == level.submitter && level.submitter != settings.channel) {
      return "Please wait for your level to be completed before you submit again.";
    }

    var result = levels.find(x => x.submitter == level.submitter);
    if (result == undefined || level.submitter == settings.channel) {
      levels.push(level);
      queue.save();
      if (level.code == 'R0M-HAK-LVL') {
        return level.submitter + ", your ROMhack has been added to the queue.";
      } else {
        return level.submitter + ", " + level.code + " has been added to the queue.";
      }
    } else {
      return "Sorry, " + level.submitter + ", you may only submit one level at a time.";
    }
  },

  modRemove: (usernameArgument) => {
    if (usernameArgument == '') {
      return "You can use !remove <username> to kick out someone else's level.";
    }

    var match = queue.matchUsername(usernameArgument);
    if (!levels.some(match)) {
      return "No levels from " + usernameArgument + " were found in the queue.";
    }
    levels = levels.filter(level => !match(level));
    queue.save();
    return usernameArgument + "'s level has been removed from the queue.";
  },

  remove: (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return "Sorry, we're playing that level right now!";
    }
    levels = levels.filter(x => x.submitter != username);
    queue.save();
    return username + ", your level has been removed from the queue.";
  },

  replace: (username, new_level_code) => {
    let code = extractValidCode(new_level_code);
    new_level_code = code.code;
    if (!code.valid) {
      return username + ", that level code is invalid."
    }
    var old_level = levels.find(x => x.submitter == username);
    if (old_level != undefined) {
      old_level.code = new_level_code;
      queue.save();
      if (new_level_code == 'R0M-HAK-LVL') {
        return username + ", your level in the queue has been replaced with your ROMhack."
      } else {
        return username + ", your level in the queue has been replaced with " + new_level_code + ".";
      }
    } else if (current_level != undefined && current_level.submitter == username) {
      current_level.code = new_level_code;
      queue.save();
      if (new_level_code == 'R0M-HAK-LVL') {
        return username + ", your level in the queue has been replaced with your ROMhack."
      } else {
        return username + ", your level in the queue has been replaced with " + new_level_code + ".";
      }
    } else {
      return username + ", you were not found in the queue. Use !add to add a level.";
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

  absoluteposition: async (username) => {
    if (current_level != undefined && current_level.submitter == username) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    var index = levels.findIndex(x => x.submitter == username);
    if (index != -1) {
      return (index + 1) + ((current_level != undefined) ? 1 : 0);
    }
    return -1;
  },

  submittedlevel: async (username) => {
    if (current_level != undefined && current_level.username == username) {
      return 0;
    }

    var list = await queue.list();
    var both = list.online.concat(list.offline);
    var index = both.findIndex(x => x.username == username);
    if (index != -1) {
      return both[index].code;
    }
    return -1;
  },

  weightedchance: async (displayName, username) => {
    var list = await queue.list();
    var online_users = list.online;
    var both = list.online.concat(list.offline);
    var index = both.findIndex(x => x.username == username);

    if (current_level != undefined && current_level.submitter == displayName) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    if (twitch.checkLurk(username)) {
      return -2;
    }

    var elegible_users = new Array();
    for (let i = 0; i < online_users.length; i++) {
      if (waitingUsers.includes(online_users[i].username)) {
        elegible_users.push(online_users[i])
      }
    }
    var elegible_users_time = new Array();
    for (let i = 0; i < elegible_users.length; i++) {
      elegible_users_time.push(userWaitTime[waitingUsers.indexOf(elegible_users[i].username)]);
    }

    if (index != -1) {
      let stringElegibleUsers = "";
      for (let i = 0; i < elegible_users.length; i++) {
        stringElegibleUsers = stringElegibleUsers + elegible_users[i].username + ", ";
      }
      console.log('Elegible users: ' + stringElegibleUsers);
      console.log('Elegible users time: ' + elegible_users_time);
      var userIndex = waitingUsers.indexOf(username);
      var userChance = userWaitTime[userIndex];
      var totalOdds = elegible_users_time.reduce((a, b) => a + b, 0);
      console.log(`The userChance is ${userChance} with totalOdds ${totalOdds}`);
      return (userChance / totalOdds * 100).toFixed(1);
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
    return 'Ok, adding the current level back into the queue.';
  },

  dismiss: async () => {
    if (current_level === undefined) {
      return "The nothing you aren't playing cannot be dismissed.";
    }
    let response = 'Dismissed ' + current_level.code + ' submitted by ' + current_level.submitter + '.';
    current_level = undefined;
    queue.save();
    return response;
  },

  next: async () => {
    var list = await queue.list();
    var both = list.online.concat(list.offline);
    if (both.length === 0) {
      current_level = undefined;
      return current_level;
    } else {
      current_level = both.shift();
      queue.removeWaiting();
    }
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
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
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
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
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
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
    chosenUserOverallIndex = waitingUsers.indexOf(current_level.username);
    if (chosenUserOverallIndex != -1) {
      waitingUsers.splice(chosenUserOverallIndex, 1);
      userWaitTime.splice(chosenUserOverallIndex, 1);
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
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
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
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
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
        return current_level;
      }
    }

    var random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    var index = levels.findIndex(x => x.submitter == current_level.submitter);
    queue.removeWaiting();
    levels.splice(index, 1);
    queue.save();
    return current_level;
  },

  weightedrandom: async () => {
    var list = await queue.list();
    var online_users = list.online;
    if (online_users.length == 0 || waitingUsers.length == 0) {
      current_level = undefined;
      return current_level;
    }
    var elegible_users = new Array();
    for (let i = 0; i < online_users.length; i++) {
      if (waitingUsers.includes(online_users[i].username)) {
        elegible_users.push(online_users[i])
      }
    }
    if (elegible_users.length == 0) {
      current_level = undefined;
      return current_level;
    }
    var elegible_users_time = new Array();
    for (let i = 0; i < elegible_users.length; i++) {
      elegible_users_time.push(userWaitTime[waitingUsers.indexOf(elegible_users[i].username)]);
    }

    var totalOdds = elegible_users_time.reduce((a, b) => a + b, 0);
    var randomNumber = Math.floor(Math.random() * totalOdds) + 1;
    var levelIndex = 0;
    var gettingThereSomeday = elegible_users_time[0];
    console.log("Elegible users time: " + elegible_users_time);

    while (gettingThereSomeday < randomNumber) {
      levelIndex++;
      gettingThereSomeday = gettingThereSomeday + elegible_users_time[levelIndex];
      console.log("Random number: " + randomNumber);
      console.log("Current cumulative time: " + gettingThereSomeday);
    }

    console.log("Chosen index was " + levelIndex + " after a cumulative time of " + gettingThereSomeday);
    current_level = elegible_users[levelIndex];

    var index = levels.findIndex(x => x.username == current_level.username);
    levels.splice(index, 1);
    queue.save();

    let selectionChance = await selectionchance(current_level.username, current_level.submitter);

    chosenUser = elegible_users[levelIndex].username;
    chosenUserOverallIndex = waitingUsers.indexOf(chosenUser);
    if (chosenUserOverallIndex != -1) {
      waitingUsers.splice(chosenUserOverallIndex, 1);
      userWaitTime.splice(chosenUserOverallIndex, 1);
    }

    return { ...current_level, selectionChance };
  },

  list: async () => {
    var online = new Array();
    var offline = new Array();
    var errorCheck;
    await twitch.getOnlineUsers(settings.channel).then(online_users => {
      if (online_users == null) {
        errorCheck = true;
        return;
      } else {
        online = levels.filter(x => online_users.has(x.username));
        offline = levels.filter(x => !online_users.has(x.username));
      }
    });
    if (errorCheck) {
      return null;
    } else {
      return {
        online: online,
        offline: offline
      };
    }
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

  matchUsername: (usernameArgument) => {
    usernameArgument = usernameArgument.trim().replace(/^@/, '');
    return level => {
      // display name (submitter) or user name (username) matches
      return level.submitter == usernameArgument || level.username == usernameArgument;
    };
  },

  matchUsername: (usernameArgument) => {
    usernameArgument = usernameArgument.trim().replace(/^@/, '');
    return level => {
      // Display name (submitter) or username (username) matches
      return level.submitter == usernameArgument || level.username == usernameArgument;
    };
  },

  customCodeManagement: (codeArguments) => {
    let args = codeArguments.split(' ');
    if ((args[0] == 'add') && (args.length == 3)) {
      args[2] = args[2].toUpperCase();
      if (customCodesMap.has(args[1])) {
        return "The custom code " + args[1] + " already exists.";
      }
      customCodesMap.set(args[1], args[2]);
      fs.writeFile('customCodes.json', JSON.stringify(Array.from(customCodesMap.entries())), (err) => {
        if (err) {
          return "An error occurred while trying to add your custom code.";
        }
      });
      return "Your custom code " + args[1] + " for ID " + args[2] + " has been added.";
    } else if ((args[0] == 'remove') && (args.length == 2)) {
      if (!customCodesMap.has(args[1])) {
        return "The custom code " + args[1] + " could not be found.";
      }
      customCodesMap.delete(args[1]);
      fs.writeFile('customCodes.json', JSON.stringify(Array.from(customCodesMap.entries())), (err) => {
        if (err) {
          return "An error occurred while trying to remove that custom code.";
        }
      });
      return "The custom code " + args[1] + " has been removed.";
    } else {
      return "Invalid arguments. The correct syntax is !customcode {add/remove} {customCode} {ID}.";
    }
  },

  customCodes: () => {
    let response = "";
    let iterator = customCodesMap.keys();
    for (i = 0; i < customCodesMap.size; i++) {
      response = response + iterator.next().value + ', ';
    }
    response = response.substring(0, response.length-2);
    if (response == "") {
      return 'There are no custom codes set.';
    } else {
      return 'The current custom codes are: ' + response + '.';
    }
  },

  save: () => {
    var levels_to_save = levels;
    if (current_level != undefined) {
      levels_to_save = [{...current_level, current_level: true}].concat(levels_to_save);
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
        console.warn('Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names.');
        console.warn('To be safe, clear the queue with !clear.');
        levels.forEach(level => {
          if (username_missing(level)) {
            level.username = level.submitter.toLowerCase();
          }
        });
      }
      // Find the current level
      const is_current = level => level.hasOwnProperty('current_level') && level.current_level;
      // Make sure to remove the current_property levels for all levels
      const rm_current = level => { let result = { ...level }; delete result.current_level; return result; };
      let current_levels = levels.filter(is_current).map(rm_current);
      if (current_levels.length == 1) {
        current_level = current_levels[0];
        levels = levels.filter(x => !is_current(x)).map(rm_current);
      } else {
        if (current_levels.length > 1) {
          console.warn('More than one level in the queue is marked as the current level.');
          console.warn('This will be ignored and no level will be marked as the current level.');
        }
        current_level = undefined;
        levels = levels.map(rm_current);
      }
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
