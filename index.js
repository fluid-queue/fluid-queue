const settings = require('./settings.js');
const chatbot = require('./chatbot.js');
const quesoqueue = require('./queue.js').quesoqueue();
const twitch = require('./twitch.js').twitch();
const timer = require('./timer.js');
const i18n = require("i18n");
const global_lang = { channel: settings.channel, command_add: '!add', command_back: '!back', command_remove: '!remove' };

i18n.configure({
  locales: settings.locales,
  directory: __dirname + '/locales',
  objectNotation: true,
  register: global,
});
i18n.setLocale(settings.locale);

quesoqueue.load();

var queue_open = false;
var selection_iter = 0;
const level_timer = timer.timer(
  () => {
    chatbot_helper.say(__mf('timer.expired', global_lang));
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
    return __mf('queue.list.empty', {sender, ...global_lang});
  }

  let levels5 = levels.online.slice(0, 5).reduce((acc, x) => acc + __mf('listSeparator') + x.submitter, '');
  let etc = levels.online.length > 5;
  let online = levels.online.length + (current !== undefined ? 1 : 0);
  let offline = levels.offline.length;
  return __mf('queue.list.message', {...current, levels: levels5, etc, online, offline, sender, ...global_lang});
};

const next_level_message = (level, sender = undefined, type = undefined) => {
  if (level === undefined) {
    return __mf('queue.next.empty', {type, sender, ...global_lang});
  }
  return __mf('queue.next.level', {...level, type, sender, ...global_lang});
};

const current_level_message = (level, sender = undefined) => {
  if (level === undefined) {
    return __mf('queue.current.empty', {sender, ...global_lang});
  }
  return __mf('queue.current.level', {...level, sender, ...global_lang});
};

const position_message = async (position, sender) => {
  if (position == -1) {
    return __mf('queue.position.unavailable', {sender, ...global_lang});
  } else if (position === 0) {
    return __mf('queue.position.current', {sender, ...global_lang});
  }
  return __mf('queue.position.position', {position, sender, ...global_lang});
};

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.
async function HandleMessage(message, sender, respond) {
  if (sender.username === undefined || message === undefined) {
    console.log('undefined data');
  }
  twitch.noticeChatter(sender);
  if (message == '!open' && sender.isBroadcaster) {
    queue_open = true;
    respond(__mf('queue.open', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!close' && sender.isBroadcaster) {
    queue_open = false;
    respond(__mf('queue.close', {sender: sender.displayName, ...global_lang}));
  } else if (message.startsWith('!add')) {
    if (queue_open || sender.isBroadcaster) {
      let level_code = get_remainder(message);
      let level = Level(level_code, sender.displayName, sender.username);
      let result = quesoqueue.add(level);
      respond(__mf(`queue.add.${result}`, {...level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__mf('queue.add.closed', {sender: sender.displayName, ...global_lang}));
    }
  } else if (message.startsWith('!remove') || message.startsWith('!leave')) {
    var result = undefined;
    var command = undefined;
    if (sender.isBroadcaster) {
      var to_remove = get_remainder(message);
      result = quesoqueue.modRemove(to_remove);
      command = "modRemove";
    } else {
      result = quesoqueue.remove(sender.displayName);
      command = "remove";
    }
    if (result === undefined) {
      respond(__mf(`queue.${command}.unavailable`, {sender: sender.displayName, ...global_lang}));
    } else {
      respond(__mf(`queue.${command}.current`, {...result, sender: sender.displayName, ...global_lang}));
    }
  } else if (
    message.startsWith('!replace') ||
    message.startsWith('!change') ||
    message.startsWith('!swap')
  ) {
    let level_code = get_remainder(message);
    let level = Level(level_code, sender.displayName);
    let result = quesoqueue.replace(level.submitter, level.code);
    respond(__mf(`queue.replace.${result}`, {...level, sender: sender.displayName, ...global_lang}));
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
      default:
        selection_mode = 'default';
        next_level = await quesoqueue.next();
    }
    level_timer.restart();
    level_timer.pause();
    respond(next_level_message(next_level, sender.displayName, selection_mode));
  } else if (message == '!next' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.next();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!subnext' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subnext();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!modnext' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modnext();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!random' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.random();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!subrandom' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subrandom();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!modrandom' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modrandom();
    respond(next_level_message(next_level, sender.displayName));
  } else if (message == '!punt' && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let punt_level = await quesoqueue.punt();
    if (punt_level !== undefined) {
      respond(__mf('queue.punt.current', {...punt_level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__mf('queue.punt.unavailable', {sender: sender.displayName, ...global_lang}));
    }
  } else if (message.startsWith('!dip') && sender.isBroadcaster) {
    var username = get_remainder(message);
    level_timer.restart();
    level_timer.pause();
    var dip_level = quesoqueue.dip(username);
    if (dip_level !== undefined) {
      respond(__mf('queue.dip.current', {...dip_level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__mf('queue.dip.unavailable', {username, sender: sender.displayName, ...global_lang}));
    }
  } else if (message == '!current') {
    respond(current_level_message(quesoqueue.current(), sender.displayName));
  } else if (message.startsWith('!list') || message.startsWith('!queue')) {
    if (can_list) {
      can_list = false;
      setTimeout(() => can_list = true, settings.message_cooldown * 1000);
      respond(level_list_message(sender.displayName, quesoqueue.current(), await quesoqueue.list()));
    } else {
      respond(__mf('queue.list.messageCooldown', {sender: sender.displayName, ...global_lang}));
    }
  } else if (message == '!position') {
    respond(await position_message(await quesoqueue.position(sender.displayName), sender.displayName));
  } else if (message == '!start' && sender.isBroadcaster) {
    level_timer.resume();
    respond(__mf('timer.start', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!resume' && sender.isBroadcaster) {
    level_timer.resume();
    respond(__mf('timer.resume', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!pause' && sender.isBroadcaster) {
    level_timer.pause();
    respond(__mf('timer.pause', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!restart' && sender.isBroadcaster) {
    level_timer.restart();
    respond(__mf('timer.restart', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!restore' && sender.isBroadcaster) {
    quesoqueue.load();
    respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
  } else if (message == '!clear' && sender.isBroadcaster) {
    quesoqueue.clear();
    respond(__mf('queue.clear', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!lurk') {
    twitch.setToLurk(sender.username);
    respond(__mf('queue.lurk', {sender: sender.displayName, ...global_lang}));
  } else if (message == '!back') {
    if (twitch.notLurkingAnymore(sender.username)) {
      respond(__mf('queue.back', {sender: sender.displayName, ...global_lang}));
    }
  } else if (message == '!order') {
    if (settings.level_selection.length == 0) {
      respond(__mf('queue.order.unavailable', {sender: sender.displayName, ...global_lang}));
    } else {
      let order = settings.level_selection.map(type => __mf('queue.order.type', {type})).reduce((acc, x) => acc + __mf('listSeparator') + x);
      let next = __mf('queue.order.type', {type: settings.level_selection[selection_iter % settings.level_selection.length]});
      respond(__mf('queue.order.current', {order, next, sender: sender.displayName, ...global_lang}));
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
