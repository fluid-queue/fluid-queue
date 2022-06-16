const fs = require("fs");

/**
 * @readonly
 */
const order_options = ["next", "subnext", "modnext", "random", "weightedrandom", "subrandom", "modrandom"]
/**
 *
 * @typedef settings
 * @property {string} username - username bot will use to connect to twitch
 * @property {string} password - oauth token generated at https://twitchapps.com/tmi/
 * @property {string} channel - channel for bot to run in
 * @property {boolean} [start_open] - whether queue will start open
 * @property {boolean} [enable_absolute_position] - display position including offline levels
 * @property {boolean} [custom_codes_enabled] - allow custom codes
 * @property {boolean} [romhacks_enabled] - allow romhacks *if* custom codes are enabled
 * @property {number} [max_size] - max number of levels in the queue
 * @property {number} [level_timeout] - number of minutes on one level before timer goes off
 * @property {typeof order_options[number][]} level_selection - order of methods used to pick next level
 * @property {number} [message_cooldown] - number of seconds between list commands
 * @property {number} [dataIdCourseThreshold] - maximum allowed data id for course ids if set
 * @property {number} [dataIdMakerThreshold] - maximum allowed data id for maker ids if set
 */

/** @type {settings} */
const settings = JSON.parse(
  fs.readFileSync("settings.json", { encoding: "utf8" })
);

/** @type {{[key: string]: (setting: any) => boolean}} */
const settings_validations = {
  username: (name) => typeof name === "string",
  password: (pass) => typeof pass === "string" && pass.startsWith("oauth"),
  channel: (channel) => typeof channel === "string" && /^[a-z0-9_]{3,}$/.test(channel), // channel needs to be a valid twitch username (this is used in the chatters URL in twitch.js)
  start_open: (open) => typeof open === "boolean",
  enable_absolute_position: (absolute_position) => typeof absolute_position === "boolean",
  custom_codes_enabled: cc => typeof cc === "boolean",
  romhacks_enabled: hacks => typeof hacks === "boolean", // whether or not romhacks can be submitted to the queue, only works if custom_codes_enabled is set to true
  max_size: max => typeof max === "number",
  level_timeout: timeout => timeout == null || typeof timeout === "number",
  level_selection: (selections) => [...selections].every(next => order_options.includes(next)),
  message_cooldown: cool => typeof cool === "number",
  dataIdCourseThreshold: threshold => threshold == null || typeof threshold === "number",
  dataIdMakerThreshold: threshold => threshold == null || typeof threshold === "number"
};

for (const key in settings) {
  if (Object.hasOwnProperty.call(settings, key)) {
    try {
        if (!settings_validations[key](settings[key])) {
        throw new Error(`problem with ${key}`)
      }
    } catch(e) {
      if (e instanceof TypeError) {
        throw new TypeError(`${key} is not a valid option!`)
      }
      throw e;
    }
  }
}

module.exports = settings;
