const fs = require("fs");

/**
 * @readonly
 */
const order_options = ["next", "subnext", "modnext", "random", "weightedrandom", "weightednext", "subrandom", "modrandom", "weightedsubrandom", "weightedsubnext"];
/**
 * @readonly
 */
 const list_options = ["position", "weight", "both", "none"];
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
 * @property {boolean} [prettySaveFiles] - true if and only if the save files in ./data/*.json should be formatted
 * @property {number} [subscriberWeightMultiplier] - the multiplier value for subs, has to be equal to or greater than 1, e.g. a value of `1.2` will add `1.2` minutes of wait time per minute
 * @property {typeof list_options[number]} [position] - which position is displayed: show the "position", or the "weight" position or display "both" positions, or do not show positions "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise
 * @property {typeof list_options[number]} [list] - how the list is displayed: sort by "position", or "weight" or display list twice "both", or do not list levels "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise
 */

/** @type {settings} */
const settings = JSON.parse(
  fs.readFileSync("settings.json", { encoding: "utf8" })
);

/** @type {{[key: string]: (setting: any) => boolean}} */
const settings_validations = {
  username: (name) => typeof name === "string",
  password: (pass) => typeof pass === "string" && pass.startsWith("oauth"),
  channel: (channel) => typeof channel === "string" && /^[a-z0-9_]{2,}$/.test(channel), // channel needs to be a valid twitch username (this is used in the chatters URL in twitch.js)
  start_open: (open) => typeof open === "boolean",
  enable_absolute_position: (absolute_position) => typeof absolute_position === "boolean",
  custom_codes_enabled: cc => typeof cc === "boolean",
  romhacks_enabled: hacks => typeof hacks === "boolean", // whether or not romhacks can be submitted to the queue, only works if custom_codes_enabled is set to true
  max_size: max => typeof max === "number",
  level_timeout: timeout => timeout == null || typeof timeout === "number",
  level_selection: (selections) => [...selections].every(next => order_options.includes(next)),
  message_cooldown: cool => typeof cool === "number",
  dataIdCourseThreshold: threshold => threshold == null || typeof threshold === "number",
  dataIdMakerThreshold: threshold => threshold == null || typeof threshold === "number",
  prettySaveFiles: (pretty) => pretty == null || typeof pretty === "boolean",
  subscriberWeightMultiplier: (multiplier) => multiplier == null || (typeof multiplier === "number" && multiplier >= 1.0),
  position: position => position == null || list_options.includes(position),
  list: list => list == null || list_options.includes(list),
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
