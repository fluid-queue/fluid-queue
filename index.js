const settings = require("./settings.js");
const chatbot = require("./chatbot.js");
const queue = require("./queue.js");
const twitch = require("./twitch.js").twitch();
const timer = require("./timer.js");
const persistence = require("./persistence.js");
const aliasManagement = require("./aliases.js");

const quesoqueue = queue.quesoqueue();
const aliases = aliasManagement.aliases();
const { displayLevel } = queue;

// patch fs to use the graceful-fs, to retry a file rename under windows
persistence.patchGlobalFs();
persistence.createDataDirectory();
quesoqueue.load();
aliases.loadAliases();

var queue_open = settings.start_open;
var selection_iter = 0;
let level_timer;
if (settings.level_timeout)
  level_timer = timer.timer(() => {
    chatbot_helper.say(
      `@${settings.channel} the timer has expired for this level!`
    );
  }, settings.level_timeout * 1000 * 60);

const get_remainder = (x) => {
  var index = x.indexOf(" ");
  if (index == -1) {
    return "";
  }
  return x.substr(index + 1);
};

const Level = (level_code, submitter, username) => {
  return { code: level_code, submitter: submitter, username: username };
};

var can_list = true;
const level_list_message = (sender, current, levels) => {
  if (
    current === undefined &&
    levels.online.length === 0 &&
    levels.offline.length === 0
  ) {
    return "There are no levels in the queue.";
  }
  var result =
    levels.online.length + (current !== undefined ? 1 : 0) + " online: ";
  result +=
    current !== undefined ? current.submitter + " (current)" : "(no current level)";

  result += levels.online
    .slice(0, 5)
    .reduce((acc, x) => acc + ", " + x.submitter, "");
  result +=
    "..." +
    (levels.online.length > 5 ? "etc." : "") +
    " (" +
    levels.offline.length +
    " offline)";
  return result;
};

const level_weighted_list_message = (sender, current, weightedList) => {
  if (
    current === undefined &&
    weightedList.entries.length === 0 &&
    weightedList.offlineLength === 0
  ) {
    return "There are no levels in the queue.";
  }
  //console.log(weightedList);
  var result = weightedList.entries.length + (current !== undefined ? 1 : 0) + " online: ";
  result += current !== undefined ? current.submitter + " (current)" : "(no current level)";

  result += weightedList.entries
    .slice(0, 5)
    .reduce((acc, x) => acc + ", " + x.level.submitter + " (" + quesoqueue.percent(x.weight(), weightedList.totalWeight) + "%)", "");
  result += "...";
  result += (weightedList.entries.length > 5 ? "etc." : "");
  result += " (" + weightedList.offlineLength + " offline)";
  return result;
};

const next_level_message = (level) => {
  if (level === undefined) {
    return "The queue is empty.";
  }
  if (level.code == "R0M-HAK-LVL") {
    return "Now playing a ROMhack submitted by " + level.submitter + ".";
  } else {
    return (
      "Now playing " + displayLevel(level) + " submitted by " + level.submitter + "."
    );
  }
};

const weightedrandom_level_message = (level, percentSuffix = '') => {
  if (level === undefined) {
    return "The queue is empty.";
  }
  if (level.code == "R0M-HAK-LVL") {
    return (
      "Now playing a ROMhack submitted by " +
      level.submitter +
      " with a " +
      level.selectionChance +
      "%" + percentSuffix + " chance of selection."
    );
  } else {
    return (
      "Now playing " +
      displayLevel(level) +
      " submitted by " +
      level.submitter +
      " with a " +
      level.selectionChance +
      "%" + percentSuffix + " chance of selection."
    );
  }
};

const weightednext_level_message = (level, percentSuffix = '') => {
  if (level === undefined) {
    return "The queue is empty.";
  }
  if (level.code == "R0M-HAK-LVL") {
    return (
      "Now playing a ROMhack submitted by " +
      level.submitter +
      " with the highest wait time of " +
      level.selectionChance +
      "%" + percentSuffix + "."
    );
  } else {
    return (
      "Now playing " +
      displayLevel(level) +
      " submitted by " +
      level.submitter +
      " with the highest wait time of " +
      level.selectionChance +
      "%" + percentSuffix + "."
    );
  }
};

const current_level_message = (level) => {
  if (level === undefined) {
    return "We're not playing a level right now!";
  }
  if (level.code == "R0M-HAK-LVL") {
    return "Currently playing a ROMhack submitted by " + level.submitter + ".";
  } else {
    return (
      "Currently playing " +
      displayLevel(level) +
      " submitted by " +
      level.submitter +
      "."
    );
  }
};

const get_ordinal = (num) => {
  var ends = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"];
  if (num % 100 >= 11 && num % 100 <= 13) {
    return num + "th";
  }
  return num + ends[num % 10];
};

const hasPosition = () => {
  return settings.position == "both" || settings.position == "position" || (settings.position == null && (settings.level_selection.includes("next") || !settings.level_selection.includes("weightednext")));
};

const hasWeightedPosition = () => {
  return settings.position == "both" || settings.position == "weight" || (settings.position == null && settings.level_selection.includes("weightednext"));
};

const hasPositionList = () => {
  return settings.list == "both" || settings.list == "position" || (settings.list == null && (settings.level_selection.includes("next") || !settings.level_selection.includes("weightednext")));
};

const hasWeightList = () => {
  return settings.list == "both" || settings.list == "weight" || (settings.list == null && settings.level_selection.includes("weightednext"));
};

const position_message = async (position, weightedPosition, sender, username) => {
  if (position == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (position === 0) {
    return "Your level is being played right now!";
  } else if (position === -3) {
    // show only weighted position!
    if (weightedPosition == -1) {
      return (
        sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
      );
    } else if (weightedPosition === 0) {
      return "Your level is being played right now!";
    } else if (weightedPosition == -2) {
      return (
        sender +
        ", you are in a BRB state, so you cannot be selected in weighted next. Try using !back and then checking again."
      );
    } else if (weightedPosition == -3) {
      // none
      return "";
    }
    return (
      sender +
      ", you are currently in the weighted " +
      get_ordinal(weightedPosition) +
      " position."
    );
  }
  if (settings.enable_absolute_position) {
    let absPosition = await quesoqueue.absolutePosition(username);
    if (weightedPosition > 0) {
      return (
        sender +
        ", you are currently in the online " +
        get_ordinal(position) +
        " position, the offline " +
        get_ordinal(absPosition) +
        " position, and the weighted " + 
        get_ordinal(weightedPosition) +
        " position."
      );
    } else {
      return (
        sender +
        ", you are currently in the online " +
        get_ordinal(position) +
        " position and the offline " +
        get_ordinal(absPosition) +
        " position."
      );
    }
  } else {
    if (weightedPosition > 0) {
      return (
        sender +
        ", you are currently in the " +
        get_ordinal(position) +
        " position and the weighted " +
        get_ordinal(weightedPosition) +
        " position."
      );
    } else {
      return (
        sender +
        ", you are currently in the " +
        get_ordinal(position) +
        " position."
      );
    }
  }
};

const weightedchance_message = async (chance, multiplier, sender) => {
  if (chance == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (chance == -2) {
    return (
      sender +
      ", you are in a BRB state, so you cannot be selected in weighted random. Try using !back and then checking again."
    );
  } else if (chance === 0) {
    return "Your level is being played right now!";
  }
  return (
    sender +
    ", you have a " +
    chance +
    "% chance of getting chosen in weighted random." +
    (multiplier > 1.0 ? " (" + multiplier.toFixed(1) + " multiplier)" : "")
  );
};

const submitted_message = async (level, sender) => {
  if (level === -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (level === -0) {
    return "Your level is being played right now!";
  }
  return sender + ", you have submitted " + displayLevel(level) + " to the queue.";
};

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.

async function HandleMessage(message, sender, respond) {
  if (sender.username === undefined || message === undefined) {
    console.log("undefined data");
  }
  twitch.noticeChatter(sender);

  let args = message.split(" ");
  let cmd = args.shift();
  cmd = cmd.toLowerCase();
  args = args.join(" ");
  message = cmd + args;
  if (args.length == 0) {
    message = cmd;
  } else {
    message = cmd + " " + args;
  }

  if((message.toLowerCase().startsWith("!addalias")) && sender.isBroadcaster){
    if(message.split(' ').length !== 3){
      respond("The syntax for adding an alias is: !addAlias command alias, for example: !addAlias open op");
    } else {
      let splitMessage = message.split(' ');
      if(aliases.addAlias(splitMessage[1].toLowerCase(), splitMessage[2])){
        respond("Alias " + splitMessage[2] + " for command " + splitMessage[1] + " has been added.");
      } else {
        if(!aliases.isCommand(splitMessage[1].toLowerCase())){
          let commands = aliases.getCommands().join(' ');
          respond("The command entered is invalid. Valid commands are: " + commands);
        } else if(aliases.isDisabled(splitMessage[1].toLowerCase())){
          respond("The command " + splitMessage[1] +" is currently disabled.");
        } else {
          respond("The alias " + splitMessage[2] + " has already been assigned.");
        }
      }
    }
  } else if ((message.toLowerCase().startsWith("!enablecmd") || message.toLowerCase().startsWith("!disablecmd") || message.toLowerCase().startsWith("!resetcmd")) && sender.isBroadcaster) {
    if(message.split(' ').length !== 2){
      respond("The syntax for enabling, disabling and resetting commands is: !command botcommand, for example: !enablecmd open")
    } else {
      let splitMessage = message.split(' ');
      if(splitMessage[0].toLowerCase() === "!enablecmd"){
        if(aliases.enableCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())){ // if the command starts with "!" - remove the "!".
          respond("The command " + splitMessage[1] + " has been successfully enabled.")
        } else {
          if(!aliases.isCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())) {
            let commands = aliases.getCommands().join(' ');
            respond("The command entered is invalid. Valid commands are: " + commands);
          } else {
            respond("The command " + splitMessage[1] + " is already enabled.");
          }
        }
      } else if (splitMessage[0].toLowerCase() === "!disablecmd") {
        if(aliases.disableCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())){ // if the command starts with "!" - remove the "!".
          respond("The command " + splitMessage[1] + " has been successfully disabled.")
        } else {
          if(!aliases.isCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())) {
            let commands = aliases.getCommands().join(' ');
            respond("The command entered is invalid. Valid commands are: " + commands);
          } else {
            respond("The command " + splitMessage[1] + " is already disabled.");
          }
        }
      } else if (splitMessage[0] === "!resetcmd") {
        if(aliases.resetCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())){ // if the command starts with "!" - remove the "!".
          respond("The command " + splitMessage[1] + " has been successfully enabled.")
        } else {
          if(!aliases.isCommand(splitMessage[1].startsWith("!") ? splitMessage[1].toLowerCase().substring(1) : splitMessage[1].toLowerCase())) {
            let commands = aliases.getCommands().join(' ');
            respond("The command entered is invalid. Valid commands are: " + commands);
          }
        }
      }
    }
  } else if (message.toLowerCase().startsWith("!aliases") && sender.isBroadcaster){
    respond("Availabe aliases commands are: !addAlias command alias - !enablecmd command - !disablecmd command - !resetcmd command")
    let commands = aliases.getCommands().join(' ');
    respond("Available commands are: " + commands);
  } else if (aliases.isAlias("open", message) && sender.isBroadcaster) {
    queue_open = true;
    respond("The queue is now open!");
  } else if (aliases.isAlias("close", message) && sender.isBroadcaster) {
    queue_open = false;
    respond("The queue is now closed!");
  } else if (aliases.isAlias("add", message)) {
    if (queue_open || sender.isBroadcaster) {
      let level_code = get_remainder(message);
      respond(
        quesoqueue.add(Level(level_code, sender.displayName, sender.username))
      );
    } else {
      respond("Sorry, the queue is closed right now.");
    }
  } else if (aliases.isAlias("remove", message)) {
    if (sender.isBroadcaster) {
      var to_remove = get_remainder(message);
      respond(quesoqueue.modRemove(to_remove));
    } else {
      respond(quesoqueue.remove(sender.displayName));
    }
  } else if (aliases.isAlias("replace", message)) {
    let level_code = get_remainder(message);
    respond(quesoqueue.replace(sender.displayName, level_code));
  } else if (aliases.isAlias("level", message) && sender.isBroadcaster) {
    let next_level;
    let selection_mode = settings.level_selection[(selection_iter++) % settings.level_selection.length];
    if (selection_iter >= settings.level_selection.length) {
      selection_iter = 0;
    }
    switch (selection_mode) {
      case "next":
        next_level = await quesoqueue.next();
        break;
      case "subnext":
        next_level = await quesoqueue.subnext();
        break;
      case "modnext":
        next_level = await quesoqueue.modnext();
        break;
      case "random":
        next_level = await quesoqueue.random();
        break;
      case "subrandom":
        next_level = await quesoqueue.subrandom();
        break;
      case "modrandom":
        next_level = await quesoqueue.modrandom();
        break;
      case "weightedrandom":
        next_level = await quesoqueue.weightedrandom();
        break;
      case "weightednext":
        next_level = await quesoqueue.weightednext();
        break;
      case "weightedsubrandom":
        next_level = await quesoqueue.weightedsubrandom();
        break;
      case "weightedsubnext":
        next_level = await quesoqueue.weightedsubnext();
        break;
      default:
        selection_mode = "default";
        next_level = await quesoqueue.next();
    }
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    if (selection_mode == "weightedrandom") {
      respond("(" + selection_mode + ") " + weightedrandom_level_message(next_level));
    } else if (selection_mode == "weightednext") {
      respond("(" + selection_mode + ") " + weightednext_level_message(next_level));
    } else if (selection_mode == "weightedsubrandom") {
      respond("(" + selection_mode + ") " + weightedrandom_level_message(next_level, ' (subscriber)'));
    } else if (selection_mode == "weightedsubnext") {
      respond("(" + selection_mode + ") " + weightednext_level_message(next_level, ' (subscriber)'));
    } else {
      respond("(" + selection_mode + ") " + next_level_message(next_level));
    }
  } else if (aliases.isAlias("next", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.next();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("subnext", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.subnext();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("modnext", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.modnext();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("random", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.random();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("weightednext", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightednext();
    respond(weightednext_level_message(next_level));
  } else if (aliases.isAlias("weightedrandom", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedrandom();
    respond(weightedrandom_level_message(next_level));
  } else if (aliases.isAlias("weightedsubnext", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedsubnext();
    respond(weightednext_level_message(next_level, ' (subscriber)'));
  } else if (aliases.isAlias("weightedsubrandom", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedsubrandom();
    respond(weightedrandom_level_message(next_level, ' (subscriber)'));
  } else if (aliases.isAlias("subrandom", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.subrandom();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("modrandom", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.modrandom();
    respond(next_level_message(next_level));
  } else if (aliases.isAlias("punt", message) && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    respond(await quesoqueue.punt());
  } else if (
    aliases.isAlias("dismiss", message) &&
    sender.isBroadcaster
  ) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    respond(await quesoqueue.dismiss());
  } else if (aliases.isAlias("select", message) && sender.isBroadcaster) {
    var username = get_remainder(message);
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    var dip_level = quesoqueue.dip(username);
    if (dip_level !== undefined) {
      if (dip_level.code == "R0M-HAK-LVL") {
        respond(
          "Now playing a ROMhack submitted by " + dip_level.submitter + "."
        );
      } else {
        respond(
          "Now playing " +
          displayLevel(dip_level) +
            " submitted by " +
            dip_level.submitter +
            "."
        );
      }
    } else {
      respond("No levels in the queue were submitted by " + username + ".");
    }
  } else if (aliases.isAlias("current", message)) {
    respond(current_level_message(quesoqueue.current()));
  } else if (aliases.isAlias("list", message)) {
    let do_list = false;
    const list_position = hasPositionList();
    const list_weight = hasWeightList();
    if (!list_position && !list_weight) {
      // do nothing
    } else if (settings.message_cooldown) {
      if (can_list) {
        can_list = false;
        setTimeout(() => (can_list = true), settings.message_cooldown * 1000);
        do_list = true;
      } else {
        respond("Scroll up to see the queue.");
      }
    } else {
      do_list = true;
    }
    if (do_list) {
      const list = await quesoqueue.list();
      const current = quesoqueue.current();
      if (list_position) {
        respond(level_list_message(sender.displayName, current, list));
      }
      if (list_weight) {
        const weightedList = await quesoqueue.weightedList(true, list);
        respond(level_weighted_list_message(sender.displayName, current, weightedList));
      }
    }
  } else if (aliases.isAlias("position", message)) {
    const list = await quesoqueue.list();
    respond(
      await position_message(
        hasPosition() ? await quesoqueue.position(sender.username, list) : -3,
        hasWeightedPosition() ? await quesoqueue.weightedPosition(sender.username, list) : -3,
        sender.displayName,
        sender.username
      )
    );
  } else if (aliases.isAlias("weightedchance", message)
  ) {
    respond(
      await weightedchance_message(
        await quesoqueue.weightedchance(sender.displayName, sender.username),
        quesoqueue.multiplier(sender.username),
        sender.displayName
      )
    );
  } else if (
      aliases.isAlias("submitted", message)
  ) {
    respond(
      await submitted_message(
        await quesoqueue.submittedlevel(sender.username),
        sender.displayName
      )
    );
  } else if (settings.level_timeout && aliases.isAlias("start", message) && sender.isBroadcaster) {
    level_timer.resume();
    respond("Timer started! Get going!");
  } else if (settings.level_timeout && aliases.isAlias("resume", message) && sender.isBroadcaster) {
    level_timer.resume();
    respond("Timer unpaused! Get going!");
  } else if (settings.level_timeout && aliases.isAlias("pause", message) && sender.isBroadcaster) {
    level_timer.pause();
    respond("Timer paused");
  } else if (settings.level_timeout && aliases.isAlias("restart", message) && sender.isBroadcaster) {
    level_timer.restart();
    respond("Starting the clock over! CP Hype!");
  } else if (aliases.isAlias("persistence", message) && sender.isBroadcaster) {
    const subCommand = get_remainder(message);
    const response = await quesoqueue.persistenceManagement(subCommand);
    console.log(subCommand);
    console.log(response);
    respond(`@${sender.displayName} ${response}`);
  } else if (aliases.isAlias("clear", message) && sender.isBroadcaster) {
    quesoqueue.clear();
    respond("The queue has been cleared!");
  } else if (
    (aliases.isAlias("customcode", message)) &&
    settings.custom_codes_enabled
  ) {
    if (sender.isBroadcaster) {
      var codeArguments = get_remainder(message);
      if (codeArguments == "") {
        respond(quesoqueue.customCodes());
      } else {
        respond(await quesoqueue.customCodeManagement(codeArguments));
      }
    } else {
      respond(quesoqueue.customCodes());
    }
  } else if (aliases.isAlias("brb", message)) {
    twitch.setToLurk(sender.username);
    respond(
      "See you later, " +
        sender.displayName +
        "! Your level will not be played until you use the !back command."
    );
  } else if (aliases.isAlias("back", message)) {
    if (twitch.notLurkingAnymore(sender.username)) {
      respond("Welcome back, " + sender.displayName + "!");
    }
  } else if (aliases.isAlias("order", message)) {
    if (settings.level_selection.length === 0) {
      respond("No order has been specified.");
    } else {
      const nextIndex = selection_iter % settings.level_selection.length;
      let order = [...settings.level_selection]; // copy array
      order = order.concat(order.splice(0, nextIndex)); // shift array to the left by nextIndex positions
      respond(
        "Next level order: " +
        order.reduce((acc, x) => acc + ", " + x)
      );
    }
  }
}

// Set up the chatbot helper and connect to the Twitch channel.
const chatbot_helper = chatbot.helper(
  settings.username,
  settings.password,
  settings.channel
);
chatbot_helper.setup(HandleMessage);
chatbot_helper.connect();
