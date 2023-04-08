const fs = require("fs");

/**
 * @readonly
 */
const order_options = [
  "next",
  "subnext",
  "modnext",
  "random",
  "weightedrandom",
  "weightednext",
  "subrandom",
  "modrandom",
  "weightedsubrandom",
  "weightedsubnext",
];
/**
 * @readonly
 */
const list_options = ["position", "weight", "both", "none"];
/**
 *
 * @typedef settings
 * @property {string} channel - channel for bot to run in
 * @property {string} clientId - client id of the twitch application
 * @property {string} clientSecret - client secret of the twitch application
 * @property {boolean} [start_open] - whether queue will start open
 * @property {boolean} [enable_absolute_position] - display position including offline levels
 * @property {boolean} [custom_codes_enabled] - allow custom codes
 * @property {boolean} [romhacks_enabled] - allow romhacks *if* custom codes are enabled
 * @property {boolean} [uncleared_enabled] - allow uncleared levels *if* custom codes are enabled
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
 * @property {boolean} [showMakerCode] - if maker codes should be marked as such
 * @property {string[]} [resolvers] - the resolver names that are enabled, see extensions.ts for options
 */

// To try to
let fileName;
let settingsJson;
try {
  fileName = "settings/settings.json";
  settingsJson = fs.readFileSync(fileName, {
    encoding: "utf8",
  });
} catch (err) {
  if (err.code === "ENOENT") {
    fileName = "settings.json";
    settingsJson = fs.readFileSync(fileName, { encoding: "utf8" });
    console.warn(
      "Loading settings.json from the root directory is deprecated and may stop working in a future release."
    );
    console.warn("Please move settings.json into the settings directory.");
  } else {
    // We only care about the file not being found, other errors should be thrown
    throw err;
  }
}

/** @type {settings} */
const settings = JSON.parse(settingsJson);

/** @type {{[key: string]: (setting: any) => boolean}} */
const settings_validations = {
  channel: (channel) =>
    typeof channel === "string" && /^[a-z0-9_]{2,}$/.test(channel), // channel needs to be a valid twitch username (this is used in the chatters URL in twitch.js)
  clientId: (clientId) =>
    typeof clientId === "string" && clientId != "{YOUR_CLIENT_ID}",
  clientSecret: (clientSecret) =>
    typeof clientSecret === "string" && clientSecret != "{YOUR_CLIENT_SECRET}",
  start_open: (open) => typeof open === "boolean",
  enable_absolute_position: (absolute_position) =>
    typeof absolute_position === "boolean",
  custom_codes_enabled: (cc) => typeof cc === "boolean",
  romhacks_enabled: (hacks) => typeof hacks === "boolean", // whether or not romhacks can be submitted to the queue, only works if custom_codes_enabled is set to true
  uncleared_enabled: (uncleared) =>
    uncleared == null || typeof uncleared === "boolean",
  max_size: (max) => typeof max === "number",
  level_timeout: (timeout) => timeout == null || typeof timeout === "number",
  level_selection: (selections) =>
    [...selections].every((next) => order_options.includes(next)),
  message_cooldown: (cool) => typeof cool === "number",
  dataIdCourseThreshold: (threshold) =>
    threshold == null || typeof threshold === "number",
  dataIdMakerThreshold: (threshold) =>
    threshold == null || typeof threshold === "number",
  prettySaveFiles: (pretty) => pretty == null || typeof pretty === "boolean",
  subscriberWeightMultiplier: (multiplier) =>
    multiplier == null || (typeof multiplier === "number" && multiplier >= 1.0),
  position: (position) => position == null || list_options.includes(position),
  list: (list) => list == null || list_options.includes(list),
  showMakerCode: (makerCode) =>
    makerCode == null || typeof makerCode === "boolean",
  smm1_codes_enabled: (smm1) => typeof smm1 === "boolean",
  resolvers: (list) => list == null || Array.isArray(list),
};

for (const key in settings) {
  if (Object.hasOwnProperty.call(settings, key)) {
    try {
      if (!settings_validations[key](settings[key])) {
        throw new Error(
          `${fileName}: the value of the setting ${key} is not valid.`
        );
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new TypeError(
          `${fileName}: setting ${key} is not a valid option!`
        );
      }
      throw e;
    }
  }
}

module.exports = { ...settings, fileName };
