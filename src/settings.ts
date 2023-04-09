import fs from "fs";
import { z } from "zod";

const order_options: readonly [string, ...string[]] = [
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

const list_options: readonly [string, ...string[]] = ["position", "weight", "both", "none"];

export const Settings = z.object(
  {
    channel: z.string().describe("channel for bot to run in").refine(
      (channel) => /^[a-z0-9_]{2,}$/.test(channel),
      { message: "channel needs to be a valid twitch login name" }
    ),
    clientId: z.string().describe("client id of the twitch application").refine((clientId) => clientId != "{YOUR_CLIENT_ID}", { message: "please replace `{YOUR_CLIENT_ID}` with the client id of your twitch application"}),
    clientSecret: z.string().describe("client secret of the twitch application").refine((clientSecret) => clientSecret != "{YOUR_CLIENT_SECRET}", { message: "Please replace `{YOUR_CLIENT_SECRET}` with your client secret."}),
    start_open: z.boolean().describe("whether queue will start open").default(false),
    enable_absolute_position: z.boolean().describe("display position including offline levels").default(false),
    custom_codes_enabled: z.boolean().describe("allow custom codes").default(false),
    romhacks_enabled: z.boolean().describe("allow romhacks").default(false),
    uncleared_enabled: z.boolean().describe("allow uncleared levels").default(false),
    max_size: z.number().int().nonnegative().describe("max number of levels in the queue").default(100),
    level_timeout: z.number().safe().describe("number of minutes on one level before timer goes off").nullable().default(null),
    level_selection: z.enum(order_options).array().describe("order of methods used to pick next level"),
    message_cooldown: z.number().safe().describe("number of seconds between list commands").nullable().default(null),
    dataIdCourseThreshold: z.number().int().describe("maximum allowed data id for course ids if set").nullable().default(null),
    dataIdMakerThreshold: z.number().int().describe("maximum allowed data id for maker ids if set").nullable().default(null),
    prettySaveFiles: z.boolean().describe("true if and only if the save files in ./data/**.json should be formatted").default(() => process.env.NODE_ENV != "production" && process.env.NODE_ENV != "test"),
    subscriberWeightMultiplier: z.number().finite().gte(1).describe("the multiplier value for subs, has to be equal to or greater than 1, e.g. a value of `1.2` will add `1.2` minutes of wait time per minute").nullable().default(null),
    position: z.enum(list_options).describe('which position is displayed: show the "position", or the "weight" position or display "both" positions, or do not show positions "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise').nullable().default(null),
    list: z.enum(list_options).describe('how the list is displayed: sort by "position", or "weight" or display list twice "both", or do not list levels "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise').nullable().default(null),
    showMakerCode: z.boolean().describe("if maker codes should be marked as such").default(true),
    resolvers: z.string().array().describe("the resolver names that are enabled, see src/extensions.ts for options").nullable().default(null),
  }
).strict();
export type Settings = z.infer<typeof Settings>;
/**
 * @deprecated Use the `Settings` type instead.
 */
export type settings = Settings;

// To try to
export let fileName: string;
let settingsJson;
try {
  fileName = "settings/settings.json";
  settingsJson = fs.readFileSync(fileName, {
    encoding: "utf8",
  });
} catch (err) {
  if (typeof err === "object" && err != null && "code" in err && err.code === "ENOENT") {
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

export const settings: Settings = Settings.parse(JSON.parse(settingsJson));

export default settings;
