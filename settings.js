// Special settings for the bot
module.exports = {
  username: '', // bot account username on Twitch (or yours)
  password: '', // generated at https://twitchapps.com/tmi/
  channel: '', // channel where the bot will run
  start_open: false, // whether or not the queue will start open
  enable_absolute_position: false, // whether or not absolute position (offline position) will be stated alongside relative position (online position)
  max_size: 100, // the max amount of levels in the queue
  level_timeout: 9999, // The length of time in minutes a level can be played before the timer will go off
  // Acceptable values: next, subnext, modnext, random, weightedrandom, subrandom, modrandom
  // example: ['next', 'subnext', 'random']
  level_selection: [],
  message_cooldown: 5, // the length of time in seconds one must wait before !list will work again
  dataIdCourseThreshold: undefined, // change this to the number of the maximum allowed data ID for course ids
  dataIdMakerThreshold: undefined, // change this to the number of the maximum allowed data ID for maker ids
};
