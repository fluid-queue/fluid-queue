import timestring from "timestring";
import { RefinementCtx, z } from "zod";
import { warn } from "./chalk-print.js";
import { Duration } from "@js-joda/core";

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

const list_options: readonly [string, ...string[]] = [
  "position",
  "weight",
  "both",
  "none",
];

export function deprecatedValue<V, N>(
  value: V,
  newValue: N,
  ctx: RefinementCtx
) {
  warn(
    `Setting ${String(value)} for ${ctx.path.join(
      "."
    )} is deprected, please replace the value with ${String(newValue)}.`
  );
}

export const TimeValue = z.string().transform((value) => {
  value = value.trim();
  if (value.startsWith("P")) {
    // ISO-8601
    return Duration.parse(value).toMillis();
  } else {
    // user friendly
    return timestring(value, "milliseconds");
  }
});

const DeprectedMinutesValue = z
  .number()
  .safe()
  .transform((value, ctx) => {
    // do not translate this newValue as configuration is only done in english
    const newValue = JSON.stringify(`${value} minute${value == 1 ? "" : "s"}`);
    deprecatedValue(value, newValue, ctx);
    return value * 1000 * 60;
  })
  .or(TimeValue);
const DeprectedSecondsValue = z
  .number()
  .safe()
  .transform((value, ctx) => {
    // do not translate this newValue as configuration is only done in english
    const newValue = JSON.stringify(`${value} second${value == 1 ? "" : "s"}`);
    deprecatedValue(value, newValue, ctx);
    return value * 1000;
  })
  .or(TimeValue);

// these are setting provided at build-time added by build.ts to the header
export type BuildSettings = {
  /// client id of the public twitch application used for device code grant flow
  publicClientId?: string | null;
};

export const Settings = z
  .object({
    language: z
      .string()
      .toLowerCase()
      .refine((language) => /^[a-z]{2,3}(-[a-z]{2,3})?$/.test(language), {
        message: "language must be a supported language tag",
      })
      .default("en")
      .describe("the language to run the bot in"),
    /// private client authorization (legacy)
    channel: z
      .string()
      .describe("channel for bot to run in")
      .refine((channel) => /^[a-z0-9_]{2,}$/.test(channel), {
        message: "channel needs to be a valid twitch login name",
      })
      .optional(),
    /// private client authorization (legacy)
    clientId: z
      .string()
      .describe("client id of the twitch application")
      .refine((clientId) => clientId != "{YOUR_CLIENT_ID}", {
        message:
          "please replace `{YOUR_CLIENT_ID}` with the client id of your twitch application",
      })
      .optional(),
    /// private client authorization (legacy)
    clientSecret: z
      .string()
      .describe("client secret of the twitch application")
      .refine((clientSecret) => clientSecret != "{YOUR_CLIENT_SECRET}", {
        message:
          "Please replace `{YOUR_CLIENT_SECRET}` with your client secret.",
      })
      .optional(),
    start_open: z
      .boolean()
      .describe("whether queue will start open")
      .default(false),
    enable_absolute_position: z
      .boolean()
      .describe("display position including offline levels")
      .default(false),
    offline_message: z
      .boolean()
      .describe(
        "whether to print a message when a level's submitter is offline"
      )
      .default(false),
    custom_codes_enabled: z
      .boolean()
      .describe("allow custom codes")
      .default(false),
    romhacks_enabled: z.boolean().describe("allow romhacks").default(false),
    uncleared_enabled: z
      .boolean()
      .describe("allow uncleared levels")
      .default(false),
    max_size: z
      .number()
      .int()
      .nonnegative()
      .describe("max number of levels in the queue")
      .default(100),
    /**
     * configured as a timestring (with the deprected fallback of setting minutes), but resolves to milliseconds
     */
    level_timeout: DeprectedMinutesValue.describe(
      "number of minutes on one level before timer goes off"
    )
      .nullable()
      .default(null),
    level_selection: z
      .enum(order_options)
      .array()
      .describe("order of methods used to pick next level"),
    /**
     * configured as a timestring (with the deprected fallback of setting seconds), but resolves to milliseconds
     */
    message_cooldown: DeprectedSecondsValue.describe(
      "number of seconds between list commands"
    )
      .nullable()
      .default(null),
    dataIdCourseThreshold: z
      .number()
      .int()
      .describe("maximum allowed data id for course ids if set")
      .nullable()
      .default(null),
    dataIdMakerThreshold: z
      .number()
      .int()
      .describe("maximum allowed data id for maker ids if set")
      .nullable()
      .default(null),
    prettySaveFiles: z
      .boolean()
      .describe(
        "true if and only if the save files in ./data/**.json should be formatted"
      )
      .default(() => {
        if (!process || !process.env) {
          return false;
        }
        return (
          process.env.NODE_ENV != "production" && process.env.NODE_ENV != "test"
        );
      }),
    subscriberWeightMultiplier: z
      .number()
      .finite()
      .gte(1)
      .describe(
        "the multiplier value for subs, has to be equal to or greater than 1, e.g. a value of `1.2` will add `1.2` minutes of wait time per minute"
      )
      .nullable()
      .default(null),
    position: z
      .enum(list_options)
      .describe(
        'which position is displayed: show the "position", or the "weight" position or display "both" positions, or do not show positions "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise'
      )
      .nullable()
      .default(null),
    list: z
      .enum(list_options)
      .describe(
        'how the list is displayed: sort by "position", or "weight" or display list twice "both", or do not list levels "none"; default is "both" if `order_options` contains "weightednext" and "next"; "weight" if `order_options` contains "weightednext" but not "next"; "position" otherwise'
      )
      .nullable()
      .default(null),
    showMakerCode: z
      .boolean()
      .describe("if maker codes should be marked as such")
      .default(true),
    resolvers: z
      .string()
      .array()
      .describe(
        "the resolver names that are enabled, see src/extensions.ts for options"
      )
      .nullable()
      .default(null),
    extensionOptions: z
      .record(z.string(), z.unknown())
      .describe("any options for your enabled resolvers")
      .nullable()
      .default(null),
    i18next_debug: z
      .boolean()
      .default(false)
      .describe("whether to enable i18next's debug mode"),
    clear: z
      .string()
      .describe(
        'The default argument for !clear. Set this to "all" to clear all levels by default.'
      )
      .nonempty() // can not be empty -> use null instead
      .nullable()
      .default(null),
  })
  .strict();
