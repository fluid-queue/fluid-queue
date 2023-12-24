import { z } from "zod";
import { QueueSubmitter } from "./extensions-api/queue-entry.js";

export const DATA_FILE_NAME = "data/channel-points.json";
export const CONFIG_FILE_NAME = "settings/channel-points.yml";
export const SUPPORTED_REWARDS: readonly [string, ...string[]] = ["skip_queue"];

export interface QueueSkipper extends QueueSubmitter {
  redemptionId: string;
}

/**
 * Base type to define a channel point reward
 */
export const ChannelPointReward = z.object({
  enabled: z
    .boolean()
    .describe("Whether the reward should be created and monitored by the bot"),
  name: z.string().describe("What the reward should be named"),
  cost: z.number().describe("How many channel points the reward should cost"),
  prompt: z
    .string()
    .optional()
    .default("")
    .describe("The description of the channel point reward."),
  global_limit: z
    .number()
    .nullable()
    .optional()
    .describe(
      "A per-stream limit, enforced by the bot, of how many times this can be redeemed."
    ),
  per_user_limit: z
    .number()
    .nullable()
    .optional()
    .describe("A per-user per-stream limit, enforced by Twitch."),
  global_cooldown: z
    .number()
    .nullable()
    .optional()
    .describe(
      "A global cooldown on the reward, enforced by Twitch. Specified in seconds."
    ),
});

/**
 * Base type to define a channel point reward
 */
export type ChannelPointRewardType = z.infer<typeof ChannelPointReward>;

/**
 * Decodes channel-points.yml
 */
export const ChannelPointConfig = z.object({
  rewards: z.record(z.enum(SUPPORTED_REWARDS), ChannelPointReward),
  // Global configuration options
  skip_spacing: z
    .number()
    .nullable()
    .optional()
    .describe("How many levels should be played in between queue-skip levels."),
});

/**
 * Decodes channel-points.json
 */
export const ChannelPointData = z.array(
  z.object({
    type: z.enum(SUPPORTED_REWARDS).describe("The type of reward."),
    id: z
      .string()
      .nullable()
      .describe("The ID of the award provided by Twitch."),
    data: ChannelPointReward.describe("The reward data itself, excluding ID."),
  })
);

/**
 * Type for data decoded from channel-points.yml
 */
export type ChannelPointConfigType = z.infer<typeof ChannelPointConfig>;

/**
 * Type for data decoded from channel-points.json
 */
export type ChannelPointDataType = z.infer<typeof ChannelPointData>;

export abstract class ChannelPointManagerPrototype {
  public abstract onStreamOnline(): void;
  public abstract onStreamOffline(): void;
  public abstract init(say_func: (message: string) => void): Promise<void>;
  public abstract getNextSubmitter(
    force: boolean
  ): Promise<QueueSubmitter | "none" | "not yet">;
  public abstract decSpacingCounter(): void;
  public abstract removeFromSkipQueue(
    remove: QueueSubmitter,
    status: "FULFILLED" | "CANCELED"
  ): void;
}
