const settings = require("./settings.js");
const chatbot = require("./chatbot.js");
const quesoqueue = require("./queue.js").quesoqueue();
const twitch = require("./twitch.js").twitch();
const timer = require("./timer.js");
const persistence = require("./persistence.js");

// patch fs to use the graceful-fs, to retry a file rename under windows
persistence.patchGlobalFs();
persistence.createDataDirectory();
quesoqueue.load();

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
      "Now playing " + level.code + " submitted by " + level.submitter + "."
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
      level.code +
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
      level.code +
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
      level.code +
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
  if (level == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (level == -0) {
    return "Your level is being played right now!";
  }
  return sender + ", you have submitted " + level + " to the queue.";
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

  if (message == "!open" && sender.isBroadcaster) {
    queue_open = true;
    respond("The queue is now open!");
  } else if (message == "!close" && sender.isBroadcaster) {
    queue_open = false;
    respond("The queue is now closed!");
  } else if (message.toLowerCase().startsWith("!add")) {
    if (queue_open || sender.isBroadcaster) {
      let level_code = get_remainder(message);
      respond(
        quesoqueue.add(Level(level_code, sender.displayName, sender.username))
      );
    } else {
      respond("Sorry, the queue is closed right now.");
    }
  } else if (message.startsWith("!remove") || message.startsWith("!leave")) {
    if (sender.isBroadcaster) {
      var to_remove = get_remainder(message);
      respond(quesoqueue.modRemove(to_remove));
    } else {
      respond(quesoqueue.remove(sender.displayName));
    }
  } else if (
    message.startsWith("!replace") ||
    message.startsWith("!change") ||
    message.startsWith("!swap")
  ) {
    let level_code = get_remainder(message);
    respond(quesoqueue.replace(sender.displayName, level_code));
  } else if (message == "!level" && sender.isBroadcaster) {
    let next_level;
    let selection_mode = settings.level_selection[selection_iter++];
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
  } else if (message == "!next" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.next();
    respond(next_level_message(next_level));
  } else if (message == "!subnext" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.subnext();
    respond(next_level_message(next_level));
  } else if (message == "!modnext" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.modnext();
    respond(next_level_message(next_level));
  } else if (message == "!random" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.random();
    respond(next_level_message(next_level));
  } else if (message == "!weightednext" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightednext();
    respond(weightednext_level_message(next_level));
  } else if (message == "!weightedrandom" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedrandom();
    respond(weightedrandom_level_message(next_level));
  } else if (message == "!weightedsubnext" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedsubnext();
    respond(weightednext_level_message(next_level, ' (subscriber)'));
  } else if (message == "!weightedsubrandom" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.weightedsubrandom();
    respond(weightedrandom_level_message(next_level, ' (subscriber)'));
  } else if (message == "!subrandom" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.subrandom();
    respond(next_level_message(next_level));
  } else if (message == "!modrandom" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    let next_level = await quesoqueue.modrandom();
    respond(next_level_message(next_level));
  } else if (message == "!punt" && sender.isBroadcaster) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    respond(await quesoqueue.punt());
  } else if (
    (message == "!dismiss" ||
      message == "!skip" ||
      message.startsWith("!complete")) &&
    sender.isBroadcaster
  ) {
    if (settings.level_timeout) {
      level_timer.restart();
      level_timer.pause();
    }
    respond(await quesoqueue.dismiss());
  } else if (message.startsWith("!select") && sender.isBroadcaster) {
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
            dip_level.code +
            " submitted by " +
            dip_level.submitter +
            "."
        );
      }
    } else {
      respond("No levels in the queue were submitted by " + username + ".");
    }
  } else if (message == "!current") {
    respond(current_level_message(quesoqueue.current()));
  } else if (message.startsWith("!list") || message.startsWith("!queue")) {
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
  } else if (message == "!position" || message == "!pos") {
    const list = await quesoqueue.list();
    respond(
      await position_message(
        hasPosition() ? await quesoqueue.position(sender.username, list) : -3,
        hasWeightedPosition() ? await quesoqueue.weightedPosition(sender.username, list) : -3,
        sender.displayName,
        sender.username
      )
    );
  } else if (
    message == "!weightedchance" ||
    message == "!odds" ||
    message == "!chance" ||
    message == "!chances"
  ) {
    respond(
      await weightedchance_message(
        await quesoqueue.weightedchance(sender.displayName, sender.username),
        quesoqueue.multiplier(sender.username),
        sender.displayName
      )
    );
  } else if (
    message == "!submitted" ||
    message == "!entry" ||
    message == "!mylevel" ||
    message == "!mylvl"
  ) {
    respond(
      await submitted_message(
        await quesoqueue.submittedlevel(sender.username),
        sender.displayName
      )
    );
  } else if (settings.level_timeout && message == "!start" && sender.isBroadcaster) {
    level_timer.resume();
    respond("Timer started! Get going!");
  } else if (settings.level_timeout && message == "!resume" && sender.isBroadcaster) {
    level_timer.resume();
    respond("Timer unpaused! Get going!");
  } else if (settings.level_timeout && message == "!pause" && sender.isBroadcaster) {
    level_timer.pause();
    respond("Timer paused");
  } else if (settings.level_timeout && message == "!restart" && sender.isBroadcaster) {
    level_timer.restart();
    respond("Starting the clock over! CP Hype!");
  } else if (message.startsWith("!persistence") && sender.isBroadcaster) {
    const subCommand = get_remainder(message);
    const response = await quesoqueue.persistenceManagement(subCommand);
    console.log(subCommand);
    console.log(response);
    respond(`@${sender.displayName} ${response}`);
  } else if (message == "!clear" && sender.isBroadcaster) {
    quesoqueue.clear();
    respond("The queue has been cleared!");
  } else if (
    (message.startsWith("!customcode") || message == "!customcodes") &&
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
  } else if (message == "!brb") {
    twitch.setToLurk(sender.username);
    respond(
      "See you later, " +
        sender.displayName +
        "! Your level will not be played until you use the !back command."
    );
  } else if (message == "!back") {
    if (twitch.notLurkingAnymore(sender.username)) {
      respond("Welcome back, " + sender.displayName + "!");
    }
  } else if (message == "!order") {
    if (settings.level_selection.length == 0) {
      respond("No order has been specified.");
    } else {
      respond(
        "Level order: " +
          settings.level_selection.reduce((acc, x) => acc + ", " + x) +
          ". Next level will be: " +
          settings.level_selection[
            selection_iter % settings.level_selection.length
          ]
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
