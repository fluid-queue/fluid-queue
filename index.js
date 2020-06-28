const settings = require('./settings.js');
const chatbot = require('./chatbot.js');
const quesoqueue = require('./queue.js').quesoqueue();
const twitch = require('./twitch.js').twitch();
const timer = require('./timer.js');

quesoqueue.load();

var queue_open = false;
var random_mode = false;
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

const Level = (level_code, submitter) => {
  return { code: level_code, submitter: submitter };
};

const level_list_message = (current, levels) => {
  if (
    current === undefined &&
    levels.online.length === 0 &&
    levels.offline.length === 0
  ) {
    return 'There are no levels in the queue :c';
  }
  var result =
    levels.online.length +
    (current !== undefined ? 1 : 0) +
    ' online level(s) in the queue: ';
  result +=
    current !== undefined
      ? current.submitter + ' (current)'
      : '(no current level)';

  if (random_mode) {
    for (let i = levels.online.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [levels.online[i], levels.online[j]] = [
        levels.online[j],
        levels.online[i]
      ];
    }
  }

  result += levels.online.reduce((acc, x) => acc + ', ' + x.submitter, '');
  result +=
    '. There are also ' +
    levels.offline.length +
    ' offline level(s) in the queue.';
  return result;
};

const next_level_message = level => {
  if (level === undefined) {
    return 'The queue is empty.  Feed me levels!';
  }
  return 'Next is ' + level.code + ', submitted by ' + level.submitter;
};

const current_level_message = level => {
  if (level === undefined) {
    return "We're not playing a level right now! D:";
  }
  return (
    'Currently playing ' + level.code + ', submitted by ' + level.submitter
  );
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
      sender + ", looks like you're not in the queue. Try !add AAA-AAA-AAA."
    );
  } else if (position === 0) {
    return 'Your level is being played right now!';
  }
  if (random_mode) {
    var levels = await quesoqueue.list();
    return (
      "We're in random mode so idk..." +
      get_ordinal(Math.ceil(Math.random() * levels.online.length)) +
      '?'
    );
  }
  return 'You are currently ' + get_ordinal(position);
};

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.
async function HandleMessage(message, sender, respond) {
  if (sender === undefined || message === undefined) {
    console.log('undefined data');
  }
  twitch.markAsOnline(sender);
  if (message == '!open' && sender == settings.channel) {
    queue_open = true;
    respond('The queue is now open!');
  } else if (message == '!close' && sender == settings.channel) {
    queue_open = false;
    respond('The queue is now closed!');
  } else if (message == '!random' && sender == settings.channel) {
    random_mode = !random_mode;
    if (random_mode) {
      respond('Random mode activated');
    } else {
      respond('Random mode deactivated');
    }
  } else if (message.startsWith('!add')) {
    if (queue_open || sender == settings.channel) {
      let level_code = get_remainder(message);
      respond(quesoqueue.add(Level(level_code, sender)));
    } else {
      respond('Sorry, the queue is closed right now :c');
    }
  } else if (message == '!remove' || message == '!leave') {
    if (sender == settings.channel) {
      var to_remove = get_remainder(message);
      respond(quesoqueue.modRemove(to_remove));
    } else {
      respond(quesoqueue.remove(sender));
    }
  } else if (
    message.startsWith('!replace') ||
    message.startsWith('!change') ||
    message.startsWith('!swap')
  ) {
    respond(quesoqueue.replace(sender, get_remainder(message)));
  } else if (message == '!next' && sender == settings.channel) {
    level_timer.restart();
    level_timer.pause();
    var next_level = random_mode ? await quesoqueue.random() : await quesoqueue.next();
    respond(next_level_message(next_level));
  } else if (message == '!punt' && sender == settings.channel) {
    respond('Ok, adding the current level back into the queue.');
    level_timer.restart();
    level_timer.pause();
    respond(next_level_message(await quesoqueue.punt()));
  } else if (message.startsWith('!dip') && sender == settings.channel) {
    var username = get_remainder(message);
    level_timer.restart();
    level_timer.pause();
    var dip_level = quesoqueue.dip(username);
    if (dip_level !== undefined) {
      respond(
        dip_level.submitter +
        "'s level " +
        dip_level.code +
        ' has been pulled up from the queue.'
      );
    } else {
      respond('No levels in the queue were submitted by ' + username);
    }
  } else if (message == '!current') {
    respond(current_level_message(quesoqueue.current()));
  } else if (message.startsWith('!list')) {
    respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
  } else if (message == '!position') {
    respond(await position_message(await quesoqueue.position(sender), sender));
  } else if (message == '!start' && sender == settings.channel) {
    level_timer.resume();
    respond('Timer started! Get going!');
  } else if (message == '!resume' && sender == settings.channel) {
    level_timer.resume();
    respond('Timer unpaused! Get going!');
  } else if (message == '!pause' && sender == settings.channel) {
    level_timer.pause();
    respond('Timer paused');
  } else if (message == '!restart' && sender == settings.channel) {
    level_timer.restart();
    respond('Starting the clock over! CP Hype!');
  } else if (message == '!restore' && sender == settings.channel) {
    quesoqueue.load();
    respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
  } else if (message == '!clear' && sender == settings.channel) {
    quesoqueue.clear();
    respond('Queue cleared! A fresh start.');
  } else if (message == '!lurk') {
    twitch.setToLurk(sender);
    respond(sender + ', your level will not be played until you use the !back command.');
  } else if (message == '!back') {
    if (twitch.notLurkingAnymore(sender)) {
      respond('Welcome back ' + sender + '!');
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
