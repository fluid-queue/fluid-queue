// Special settings for the bot
module.exports = {
  username: '', // bot account username on Twitch (or yours)
  password: '', // generated at https://twitchapps.com/tmi/
  channel: '', // channel where the bot will run (all lowercase)
  max_size: 50,
  level_timeout: 10,
  // Acceptable values: next, subnext, modnext, random, subrandom, modrandom
  // example: ['next', 'subnext', 'random']
  level_selection: [],
  message_cooldown: 5,
  commands: {
    open: ['!open'],
    close: ['!close'],
    add: ['!add'],
    remove: ['!leave', '!remove'],
    replace: ['!replace', '!change', '!swap'],
    level: ['!level'],
    next: ['!next'],
    subnext: ['!subnext'],
    modnext: ['!modnext'],
    random: ['!random'],
    subrandom: ['!subrandom'],
    modrandom: ['!modrandom'],
    punt: ['!punt'],
    dip: ['!dip', '!choose'],
    current: ['!current'],
    list: ['!list', '!queue'],
    position: ['!position', '!pos'],
    start: ['!start'],
    resume: ['!resume'],
    pause: ['!pause'],
    restart: ['!restart'],
    restore: ['!restore', '!reload'],
    clear: ['!clear'],
    lurk: ['!lurk', '!brb'],
    back: ['!back'],
    order: ['!order'],
  },
};