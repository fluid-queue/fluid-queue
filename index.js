const settings = require('./settings.js');
const chatbot = require('./chatbot.js');
const quesoqueue = require('./queue.js').quesoqueue();
const twitch = require('./twitch.js').twitch();
const timer = require('./timer.js');

quesoqueue.load();

var queue_open = settings.start_open;
var selection_iter = 0;
var percentChance;
const level_timer = timer.timer(
  () => {
    chatbot_helper.say(`@${settings.channel} the timer has expired for this level!`);
  },
  settings.level_timeout * 1000 * 60
);

const get_remainder = x => {
  var index = x.indexOf(' ');
  if (index == -1) {
    return '';
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
    return 'There are no levels in the queue.';
  }
  var result =
    levels.online.length +
    (current !== undefined ? 1 : 0) +
    ' online: ';
  result +=
    current !== undefined
      ? current.submitter + ' (current)'
      : '(no current level)';

  result += levels.online.slice(0, 5).reduce((acc, x) => acc + ', ' + x.submitter, '');
  result +=
    '...' + (levels.online.length > 5 ? 'etc.' : '') +
    ' (' + levels.offline.length +
    ' offline)';
  return result;
};

const next_level_message = level => {
  if (level === undefined) {
    return 'The queue is empty.';
  }
  if (level.code == 'R0M-HAK-LVL') {
    return ('Now playing a ROMhack submitted by ' + level.submitter + '.');
  } else {
    return 'Now playing ' + level.code + ' submitted by ' + level.submitter + '.';
  }
};

const weighted_level_message = (level) => {
  if (level === undefined) {
    return 'The queue is empty.';
  }
  if (level.code == 'R0M-HAK-LVL') {
    return ('Now playing a ROMhack submitted by ' + level.submitter + ' with a ' + level.selectionChance + '% chance of selection.');
  } else {
    return ('Now playing ' + level.code + ' submitted by ' + level.submitter + ' with a ' + level.selectionChance + '% chance of selection.');
  }
};

const current_level_message = level => {
  if (level === undefined) {
    return "We're not playing a level right now!";
  }
  if (level.code == 'R0M-HAK-LVL') {
    return ('Currently playing a ROMhack submitted by ' + level.submitter + '.');
  } else {
    return ('Currently playing ' + level.code + ' submitted by ' + level.submitter + '.');
  }
};

const get_ordinal = num => {
  var ends = ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'];
  if (num % 100 >= 11 && num % 100 <= 13) {
    return num + 'th';
  }
  return num + ends[num % 10];
};

const position_message = async (position, sender) => {
  if (position == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (position === 0) {
    return 'Your level is being played right now!';
  }
  return sender + ', you are currently in the ' + get_ordinal(position) + ' position.';
};

const weightedchance_message = async (chance, sender) => {
  if (chance == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (chance == -2) {
    return (sender + ", you are in a BRB state, so you cannot be selected in weighted random. Try using !back and then checking again.");
  } else if (chance === 0) {
    return 'Your level is being played right now!';
  } else if (isNaN(chance)) {
    return sender + ', you have a 0.0% chance of getting chosen in weighted random.';
  }
  return sender + ', you have a ' + chance + '% chance of getting chosen in weighted random.';
};

const submitted_message = async (level, sender) => {
  if (level == -1) {
    return (
      sender + ", looks like you're not in the queue. Try !add XXX-XXX-XXX."
    );
  } else if (level == -0) {
    return 'Your level is being played right now!';
  }
  return sender + ', you have submitted ' + level + ' to the queue.';
};

var customNames = ['Kamek', 'Barb', 'HahaCat', 'Mango', 'morpha3Horror', 'Buzz', 'Hill', 'Bigman', 'Water', 'Ludwig', 'Trakkan', 'Ampha', 'Cape', 'Minimg', 'Dobbsworks', 'MMA', 'RyanRocks', 'Narwhal', 'Bryson', 'Bee', 'Realm', 'Koopas', 'Hektor', 'NotLikeThis', 'Teos', 'Dias', 'Catears', 'fusionE', 'Dimitri', 'PQ', 'Meow', 'PW4-MYW-3BL', 'Chon', 'Dom', 'Hugoat', 'JPuff', 'Don', 'Nelesio', 'Hexaroot', 'Bones', 'Square', 'AJK', '2enomalous', 'Required', 'Garlic', 'Ludwig1', 'Woof', 'MistaX8', 'Just', 'Quag', 'TanukiDan', 'Maddy', 'Verwalter', 'Billy', 'Icicles', 'Kitsune', 'Josh', 'JD', 'Zoë', 'Bengy', 'Silent', 'LinkSagan', 'MysteryDesert', 'TJD', '1-1', 'Zenomalous', 'Gerhard', 'Roman', 'R0b', 'Minchen', 'Loon', '🌵', 'S3pti', 'Alfonsso', 'mafkAdd', 'Rogend', 'Jerp', 'Amozui', 'Otter', 'Nontra', 'TDK', 'Bowsette', 'Ticy', 'STPW', 'Funa', 'Phanto', 'Sacha', 'ROMhack'];
var customCodes = ['2PV-J29-2PF', '08Q-6KN-YTF', '6T1-S5C-P9G', 'QR7-T5D-GQG', '4ST-85C-LKG', 'DCR-RFM-2MG', '8DD-V5N-MSF', 'YNC-YFP-QNG', 'NB0-1MD-SLG', 'S5K-CP2-YKF', '6DW-DRS-D8G', 'SLH-DKQ-XMF', 'VHB-WMY-CFF', 'L14-CSG-9JF', 'S2C-HX7-01G', '0F7-1F8-QKF', '2P2-FYD-BGF', 'VPQ-B7K-GNF', '4M6-HMF-J7G', 'GMM-YN4-VRG', '8NB-NQT-FNF', '060-TV5-B1H', 'BH5-LP4-3JG', 'DG4-PMP-7KF', 'QTP-6X2-52G', '7HJ-089-GRG', 'VNG-4D3-8WF', 'RRY-N6J-VHG', '4L8-W82-H5G', '2Y6-F1L-2FG', 'L0L-PKM-6SF', 'F1L-398-Q3G', 'RP5-9Y8-RHF', 'DLJ-V98-7PG', '66D-XBN-R9G', 'XQV-LJP-S7G', 'WW3-XMG-6RF', '06K-8YH-92G', 'XGD-WY4-Q6G', 'S95-815-GQF', 'B0D-LL7-NTG', 'N20-6D8-QNF', 'BBF-PSF-5CG', '4SF-80T-31G', 'G5C-F42-6TG', 'S5K-CP2-YKF', 'QXR-3BM-8RG', 'LXF-LK7-CBG', 'GFQ-T4B-HDF', 'FYQ-K83-SPG', 'D09-WH5-3NF', 'JVY-3W4-11H', 'J25-950-LRF', 'F1F-BGV-MFF', '9XD-PHC-BBG', '3WC-2QB-X9G', 'YGP-JM3-0PG', 'KJW-HLM-HQF', '3FC-07X-TSG', 'DXJ-B26-5PF', 'D0R-2MH-7RG', 'QHM-GFK-2NF', 'GKD-KH2-8RF', '5TL-RG0-0MG', 'TGQ-NH4-QNF', 'BSJ-GV3-S3G', 'WST-4SL-8PG', 'Q81-L9K-42G', '9KV-S8L-0FF', 'W0W-308-8JF', ' HWS-XYP-SHF', '9HB-988-5FF', 'Y30-5NK-LLF', '66L-DV7-BHG', 'RKQ-CHP-QVF', 'CLK-L9Q-HYG', '26P-2HB-FSF','26F-DJF-BKG', 'SSB-TL8-6JF', '89T-X1F-MGF', 'QVN-V80-9DF', '714-D58-94G', 'Y3C-2R3-MYG', 'K47-2T6-S1H', 'Y43-R8L-T4G', '6WX-4RS-BSF', 'LF4-P8F-6WG', 'R0M-HAK-LVL'];

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.

async function HandleMessage(message, sender, respond) {
  if (sender.username === undefined || message === undefined) {
    console.log('undefined data');
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
    message = cmd + ' ' + args;
  }

  if (message == '!open' && sender.isBroadcaster) {
    queue_open = true;
    respond('The queue is now open!');
  } else if (message == '!close' && sender.isBroadcaster) {
    queue_open = false;
    respond('The queue is now closed!');
  } else if (message == '!customcodes') {
    var printCustomNames = '';
    for (i = 0; i < customNames.length; i++) {
      printCustomNames = printCustomNames + customNames[i] + ', ';
    }
    respond('The current custom codes are: ' + printCustomNames.substring(0, printCustomNames.length-2) + '.');
  } else if (message.toLowerCase().startsWith('!add')) {
    if (queue_open || sender.isBroadcaster) {
      let level_code = get_remainder(message.toUpperCase());
      var codeMatch = customNames.map(a => a.toUpperCase()).indexOf(level_code);
      if (codeMatch !== -1) {
        level_code = customCodes[codeMatch];
      }
      respond(quesoqueue.add(Level(level_code, sender.displayName, sender.username)));
    } else {
      respond('Sorry, the queue is closed right now.');
    }
  } else if (message.startsWith('!remove') || message.startsWith('!leave')) {
    if (sender.isBroadcaster) {
      var to_remove = get_remainder(message);
      respond(quesoqueue.modRemove(to_remove));
    } else {
      respond(quesoqueue.remove(sender.displayName));
    }
  } else if (
    message.startsWith('!replace') ||
    message.startsWith('!change') ||
    message.startsWith('!swap')
  ) {
    let level_code = get_remainder(message.toUpperCase());
    var codeMatch = customNames.map(a => a.toUpperCase()).indexOf(level_code);
    if (codeMatch !== -1) {
      level_code = customCodes[codeMatch];
    }
    respond(quesoqueue.replace(sender.displayName, level_code));
  } else if (message == '!level' && sender.isBroadcaster) {
    let next_level = undefined;
    let selection_mode = settings.level_selection[selection_iter++];
    if (selection_iter >= settings.level_selection.length) {
      selection_iter = 0;
    }
    switch (selection_mode) {
      case 'next':
        next_level = await quesoqueue.next();
        break;
      case 'subnext':
        next_level = await quesoqueue.subnext();
        break;
      case 'modnext':
        next_level = await quesoqueue.modnext();
        break;
      case 'random':
        next_level = await quesoqueue.random();
        break;
      case 'subrandom':
        next_level = await quesoqueue.subrandom();
        break;
      case 'modrandom':
        next_level = await quesoqueue.modrandom();
        break;
      case 'weightedrandom':
        next_level = await quesoqueue.weightedrandom();
        break;
      default:
        selection_mode = 'default';
        next_level = await quesoqueue.next();
    }
    level_timer.restart();
    level_timer.pause();
    if (selection_mode == 'weightedrandom') {
      respond('(' + selection_mode + ') ' + weighted_level_message(next_level));
    } else {
      respond('(' + selection_mode + ') ' + next_level_message(next_level));
    }
  } else if (message == '!next' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.next();
    respond(next_level_message(next_level));
  } else if (message == '!subnext' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subnext();
    respond(next_level_message(next_level));
  } else if (message == '!modnext' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modnext();
    respond(next_level_message(next_level));
  } else if (message == '!random' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.random();
    respond(next_level_message(next_level));
  } else if (message == '!weightedrandom' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.weightedrandom();
    respond(weighted_level_message(next_level));
  } else if (message == '!subrandom' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subrandom();
    respond(next_level_message(next_level));
  } else if (message == '!modrandom' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modrandom();
    respond(next_level_message(next_level));
  } else if (message == '!punt' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    respond(await quesoqueue.punt());
  } else if ((message == '!dismiss' || message == '!skip' || message.startsWith('!complete')) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    respond(await quesoqueue.dismiss());
  } else if (message.startsWith('!select') && sender.isBroadcaster) {
    var username = get_remainder(message);
    level_timer.restart();
    level_timer.pause();
    var dip_level = quesoqueue.dip(username);
    if (dip_level !== undefined) {
      if (dip_level.code == 'R0M-HAK-LVL') {
        respond("Now playing a ROMhack submitted by " + dip_level.submitter + ".");
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
      respond('No levels in the queue were submitted by ' + username + '.');
    }
  } else if (message == '!current') {
    respond(current_level_message(quesoqueue.current()));
  } else if (message.startsWith('!list') || message.startsWith('!queue')) {
    if (can_list) {
      can_list = false;
      setTimeout(() => can_list = true, settings.message_cooldown * 1000);
      respond(level_list_message(sender.displayName, quesoqueue.current(), await quesoqueue.list()));
    } else {
      respond('Scroll up to see the queue.');
    }
  } else if ((message == '!position') || (message == '!pos')) {
    respond(await position_message(await quesoqueue.position(sender.displayName), sender.displayName));
  } else if ((message == '!weightedchance') || (message == '!odds')) {
    respond(await weightedchance_message(await quesoqueue.weightedchance(sender.displayName, sender.username), sender.displayName));
  } else if (message == '!submitted') {
    respond(await submitted_message(await quesoqueue.submittedlevel(sender.username), sender.displayName));
  } else if (message == '!start' && sender.isBroadcaster) {
    level_timer.resume();
    respond('Timer started! Get going!');
  } else if (message == '!resume' && sender.isBroadcaster) {
    level_timer.resume();
    respond('Timer unpaused! Get going!');
  } else if (message == '!pause' && sender.isBroadcaster) {
    level_timer.pause();
    respond('Timer paused');
  } else if (message == '!restart' && sender.isBroadcaster) {
    level_timer.restart();
    respond('Starting the clock over! CP Hype!');
  } else if (message == '!restore' && sender.isBroadcaster) {
    quesoqueue.load();
    respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
  } else if (message == '!clear' && sender.isBroadcaster) {
    quesoqueue.clear();
    respond('The queue has been cleared!');
  } else if (message == '!brb') {
    twitch.setToLurk(sender.username);
    respond('See you later, ' + sender.displayName + '! Your level will not be played until you use the !back command.');
  } else if (message == '!back') {
    if (twitch.notLurkingAnymore(sender.username)) {
      respond('Welcome back, ' + sender.displayName + '!');
    }
  } else if (message == '!order') {
    if (settings.level_selection.length == 0) {
      respond('No order has been specified.');
    } else {
      respond('Level order: ' +
        settings.level_selection.reduce((acc, x) => acc + ', ' + x) +
        '. Next level will be: ' +
        settings.level_selection[selection_iter % settings.level_selection.length]);
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
