import fs from "fs";
import YAML from "yaml";
import { z } from "zod";
import {
  QueueSubmitter,
  isQueueSubmitter,
} from "./extensions-api/queue-entry.js";
import {
  HelixCustomReward,
  HelixCreateCustomRewardData,
  HelixUpdateCustomRewardData,
} from "@twurple/api";
import { twitchApi } from "./twitch-api.js";
import i18next from "i18next";
import { error, log, warn } from "./chalk-print.js";
import { sync as writeFileAtomicSync } from "write-file-atomic";
import settings from "./settings.js";
import {
  EventSubChannelRedemptionAddEvent,
  EventSubChannelRedemptionUpdateEvent,
} from "@twurple/eventsub-base";
import { Queue, quesoqueue as queue } from "./queue.js";

let quesoqueue: Queue;

const DATA_FILE_NAME = "data/channel-points.json";
const CONFIG_FILE_NAME = "settings/channel-points.yml";
const SUPPORTED_REWARDS: readonly [string, ...string[]] = ["skip_queue"];

interface QueueSkipper extends QueueSubmitter {
  redemptionId: string;
}

/**
 * Base type to define a channel point reward
 */
const ChannelPointReward = z.object({
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
type ChannelPointRewardType = z.infer<typeof ChannelPointReward>;

/**
 * Decodes channel-points.yml
 */
const ChannelPointConfig = z.object({
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
const ChannelPointData = z.array(
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
type ChannelPointConfigType = z.infer<typeof ChannelPointConfig>;

/**
 * Type for data decoded from channel-points.json
 */
type ChannelPointDataType = z.infer<typeof ChannelPointData>;

/**
 * Converts a reward from Helix to our types.
 * @param helixReward A HelixCustomReward.
 * @returns A ChannelPointRewardType object representing the same reward data.
 */
function RewardFromHelixReward(
  helixReward: HelixCustomReward
): ChannelPointRewardType {
  return {
    enabled: true,
    name: helixReward.title,
    cost: helixReward.cost,
    prompt: helixReward.prompt,
    global_limit: null,
    per_user_limit: helixReward.maxRedemptionsPerUserPerStream,
    global_cooldown: helixReward.globalCooldown,
  };
}

/**
 * Compares two ChannelPointRewardType objects to determine equality, while considering "null" and "undefined" as equal to zero for global_cooldown and per_user_limit.
 * @param first The first reward to compare.
 * @param second The second reward to complare.
 * @returns Whether the two are effectively equal.
 */
function isChannelPointReward(
  first: ChannelPointRewardType,
  second: ChannelPointRewardType
): boolean {
  const first_per_user_limit: number = first.per_user_limit
    ? first.per_user_limit
    : 0;
  const second_per_user_limit: number = second.per_user_limit
    ? second.per_user_limit
    : 0;
  const first_global_cooldown: number = first.global_cooldown
    ? first.global_cooldown
    : 0;
  const second_global_cooldown: number = second.global_cooldown
    ? second.global_cooldown
    : 0;
  return (
    first.name == second.name &&
    first.cost == second.cost &&
    first.prompt == second.prompt &&
    first_per_user_limit == second_per_user_limit &&
    first_global_cooldown == second_global_cooldown
  );
}

function redemptionToQueueSkipper(redemption: {
  userId: string;
  userName: string;
  userDisplayName: string;
  id: string;
}): QueueSkipper {
  return {
    id: redemption.userId,
    name: redemption.userName,
    displayName: redemption.userDisplayName,
    redemptionId: redemption.id,
    equals(other: Partial<QueueSkipper>) {
      return (
        isQueueSubmitter(this, other) && this.redemptionId == other.redemptionId
      );
    },
  };
}

class ChannelPointManager {
  #initialized = false;
  #enabled = false;
  #skipQueue: QueueSkipper[] = [];
  #spacingCounter = 0;
  #streamCounter = 0;
  #config: ChannelPointConfigType;
  #customRewards: ChannelPointDataType = [];
  #say_func: ((message: string) => void) | undefined = undefined;

  public constructor() {
    try {
      const configContents = fs.readFileSync(CONFIG_FILE_NAME, {
        encoding: "utf8",
      });
      this.#config = ChannelPointConfig.parse(YAML.parse(configContents));
      this.#enabled = true;
    } catch (err) {
      if (
        typeof err === "object" &&
        err != null &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        // No config file; set up a dummy one so it doesn't have to be null, and return
        this.#config = { rewards: {} };
        return;
      } else {
        throw err;
      }
    }

    if (fs.existsSync(DATA_FILE_NAME)) {
      const dataContents = fs.readFileSync(DATA_FILE_NAME, {
        encoding: "utf8",
      });
      this.#customRewards = ChannelPointData.parse(JSON.parse(dataContents));
    } else {
      this.#customRewards = [];
    }
  }

  async updateSkipQueueFromTwitch() {
    const reward = this.#customRewards.find((data) => {
      return data.type == "skip_queue";
    });
    if (reward == undefined) {
      return;
    }
    if (reward.id == null) {
      throw new Error("Trying to update skip queue before reward registered");
    }

    let twitchRedemptions;
    try {
      twitchRedemptions = await twitchApi.getCustomRewardRedemptions(reward.id);
    } catch (err) {
      error(
        "Trying to get redemptions of a reward that doesn't exist. This shouldn't happen"
      );
      throw err;
    }
    this.#skipQueue = [];
    // Go through all the redemptions that aren't canceled and aren't fulfilled. Twitch doesn't usually return any rewards that are already closed, but sometimes it seems to.
    for (const redemption of twitchRedemptions.filter(
      (value) => !value.isCanceled && !value.isFulfilled
    )) {
      if (this.#skipQueue.some((user) => user.id == redemption.userId)) {
        log(i18next.t("duplicateRedemptionRemoved", { redemption }));
        void twitchApi.updateCustomRewardRedemption(
          redemption.rewardId,
          redemption.id,
          "CANCELED"
        );
        continue;
      }
      const skipper = redemptionToQueueSkipper(redemption);
      if ((await quesoqueue.position(skipper)) < 1) {
        log(i18next.t("absentRedemptionRemoved", { redemption }));
        void twitchApi.updateCustomRewardRedemption(
          redemption.rewardId,
          redemption.id,
          "CANCELED"
        );
        continue;
      }
      this.#skipQueue.push(skipper);
    }
  }

  handleRedemptionAdd(event: EventSubChannelRedemptionAddEvent) {
    const redeemer = redemptionToQueueSkipper(event);
    // Make sure the user is actually in the queue
    quesoqueue.position(redeemer).then(
      (position) => {
        if (this.#say_func == undefined) {
          throw new Error("Trying to handle a redemption without say_func");
        }
        // Make sure we have enough rewards in the pool first
        // The reward should be paused, but we can double check
        if (
          this.#config.rewards["skip_queue"].global_limit &&
          this.#streamCounter >= this.#config.rewards["skip_queue"].global_limit
        ) {
          this.#say_func(i18next.t("skipAllRedeemed", { redeemer }));
          void twitchApi.updateCustomRewardRedemption(
            event.rewardId,
            event.id,
            "CANCELED"
          );
          // Make sure the reeward is paused
          void twitchApi.updateCustomReward(event.rewardId, {
            isPaused: true,
          });
          return;
        }
        // If they're not in the queue or their level is being played, refund their redemption
        if (position < 1) {
          this.#say_func(i18next.t("skipNotInQueue", { redeemer }));
          void twitchApi.updateCustomRewardRedemption(
            event.rewardId,
            event.id,
            "CANCELED"
          );
          return;
        }
        // This checks by user ID to prevent duplicates
        if (this.#skipQueue.some((user) => user.id == redeemer.id)) {
          this.#say_func(i18next.t("skipAlreadyRedeemed", { redeemer }));
          void twitchApi.updateCustomRewardRedemption(
            event.rewardId,
            event.id,
            "CANCELED"
          );
          return;
        }
        this.#say_func(
          i18next.t("skipRegistered", {
            redeemer,
            rewardTitle: event.rewardTitle,
          })
        );
        this.#skipQueue.push(redeemer);
        this.#streamCounter += 1;
        if (
          this.#config.rewards["skip_queue"].global_limit &&
          this.#streamCounter >= this.#config.rewards["skip_queue"].global_limit
        ) {
          void twitchApi.updateCustomReward(event.rewardId, {
            isPaused: true,
          });
        }
      },
      (reason) => {
        error("Promise rejected: ");
        throw reason;
      }
    );
  }

  handleRedemptionUpdate(event: EventSubChannelRedemptionUpdateEvent) {
    const redeemer = redemptionToQueueSkipper(event);
    // This checks by redemption ID, otherwise if someone tries to redeem it twice, it'll remove them from the skip queue
    if (
      event.status == "canceled" &&
      this.#skipQueue.some((user) => user.redemptionId == redeemer.redemptionId)
    ) {
      this.#skipQueue = this.#skipQueue.filter(
        (user) => user.redemptionId != redeemer.redemptionId
      );
      this.#streamCounter -= 1; // Return the refunded redemption to the masses
      if (
        this.#config.rewards["skip_queue"].global_limit &&
        this.#streamCounter < this.#config.rewards["skip_queue"].global_limit
      ) {
        void twitchApi.updateCustomReward(event.rewardId, {
          isPaused: false,
        });
      }
    }
  }

  public onStreamOnline() {
    this.#streamCounter = 0;
    const reward = this.#customRewards.find((data) => {
      return data.type == "skip_queue";
    });

    if (reward && reward.id) {
      void twitchApi.updateCustomReward(reward.id, {
        isPaused: false,
      });
    }
  }

  public onStreamOffline() {
    this.#streamCounter = 0;
    const reward = this.#customRewards.find((data) => {
      return data.type == "skip_queue";
    });

    if (reward && reward.id) {
      void twitchApi.updateCustomReward(reward.id, {
        isPaused: true,
      });
    }
  }

  public async init(say_func: (message: string) => void) {
    if (!this.#enabled) {
      return;
    }
    if (this.#initialized) {
      throw new Error("Trying to double init ChannelPointManager!");
    }
    this.#initialized = true;
    this.#say_func = say_func;
    quesoqueue = queue();
    if (
      !twitchApi.broadcasterTokenScopes.includes("channel:manage:redemptions")
    ) {
      this.#enabled = false;
      const err = i18next.t("channelPointMissingScope");
      warn(err);
      return;
    }

    // Temporary workaround for https://github.com/twurple/twurple/issues/512
    if (
      !twitchApi.broadcasterTokenScopes.includes("channel:read:redemptions")
    ) {
      this.#enabled = false;
      const err = i18next.t("channelPointMissingReadScope");
      warn(err);
      return;
    }

    // Check if any rewards from the config are missing from the data

    for (const rewardType of SUPPORTED_REWARDS) {
      if (this.#config.rewards[rewardType]) {
        const filteredData = this.#customRewards.filter((reward) => {
          return reward.type == rewardType;
        });
        if (filteredData.length == 0) {
          const configData = this.#config.rewards[rewardType];
          this.#customRewards.push({
            data: configData,
            type: rewardType,
            id: null,
          });
        } else if (filteredData.length == 1) {
          if (
            !isChannelPointReward(
              this.#config.rewards[rewardType],
              filteredData[0].data
            )
          ) {
            warn(i18next.t("savedRewardConflict", { type: rewardType }));
            filteredData[0].data = this.#config.rewards[rewardType];
          }
          if (filteredData[0].id != null) {
            const helixReward = await twitchApi.getCustomRewardById(
              filteredData[0].id
            );
            if (helixReward != null) {
              if (
                !isChannelPointReward(
                  RewardFromHelixReward(helixReward),
                  filteredData[0].data
                )
              ) {
                warn(i18next.t("helixRewardConflict", { type: rewardType }));
                const updateData: HelixUpdateCustomRewardData = {
                  cost: filteredData[0].data.cost,
                  title: filteredData[0].data.name,
                  prompt: filteredData[0].data.prompt,
                  maxRedemptionsPerUserPerStream:
                    filteredData[0].data.per_user_limit,
                  globalCooldown: filteredData[0].data.global_cooldown,
                  maxRedemptionsPerStream: null,
                  userInputRequired: false,
                  isEnabled: true,
                  autoFulfill: false,
                  isPaused: false,
                };
                await twitchApi.updateCustomReward(
                  filteredData[0].id,
                  updateData
                );
              }
            }
          }
        } else {
          throw new Error(
            "Saved data has multiple rewards with the same type. This should not be possible."
          );
        }
      }
    }

    // Check if any rewards from the combined config and data are missing from Twitch
    const currentRewards = await twitchApi.getCustomRewards();

    try {
      for (const reward of this.#customRewards) {
        const filteredRewards = currentRewards.filter((helixReward) => {
          return helixReward.id == reward.id;
        });
        if (reward.id == null || filteredRewards.length == 0) {
          const createRewardData: HelixCreateCustomRewardData = {
            cost: reward.data.cost,
            title: reward.data.name,
            prompt: reward.data.prompt,
            maxRedemptionsPerUserPerStream: reward.data.per_user_limit,
            globalCooldown: reward.data.global_cooldown,
            maxRedemptionsPerStream: null,
            userInputRequired: false,
            isEnabled: true,
            autoFulfill: false,
          };
          const newReward = await twitchApi.createCustomReward(
            createRewardData
          );
          log(i18next.t("customRewardCreated", { newReward }));
          reward.id = newReward.id;
        }
        // Set up the eventsub handlers
        twitchApi.registerRedemptionCallbacks(
          reward.id,
          this.handleRedemptionAdd.bind(this),
          this.handleRedemptionUpdate.bind(this)
        );
      }
    } finally {
      // Always try to write the data down, even if we hit an error, to avoid causing more problems later
      writeFileAtomicSync(
        DATA_FILE_NAME,
        JSON.stringify(
          this.#customRewards,
          null,
          settings.prettySaveFiles ? 2 : 0
        ),
        { encoding: "utf8" }
      );
    }

    void this.updateSkipQueueFromTwitch();
  }

  public async getNextSubmitter(
    force = false
  ): Promise<QueueSubmitter | "none" | "not yet"> {
    if (!this.#config.skip_spacing) {
      const nextSubmitter = this.#skipQueue.shift();
      if (nextSubmitter == undefined) {
        return "none";
      }
      return nextSubmitter;
    }
    if (this.#skipQueue.length == 0) {
      // If there are no levels, reset the spacing counter and return none because there are no levels
      this.#spacingCounter = this.#config.skip_spacing;
      return "none";
    }
    if (force || this.#spacingCounter < 1) {
      let nextSubmitter = this.#skipQueue.shift();
      if (nextSubmitter == undefined) {
        return "none";
      }

      // Make sure that the skip submitter is online, unless we're being forced to return one
      const online = await quesoqueue.isOnline(nextSubmitter);
      if (!online && !force) {
        // Try to find another skip submitter who isn't offline
        this.#skipQueue.unshift(nextSubmitter);
        let updated = false;
        for (const otherSubmitter of this.#skipQueue) {
          const otherOnline = await quesoqueue.isOnline(otherSubmitter);
          if (otherOnline) {
            updated = true;
            nextSubmitter = otherSubmitter;
            break;
          }
        }
        if (!updated) {
          return "none";
        }
      }

      // Reset the spacing counter
      this.#spacingCounter = this.#config.skip_spacing;

      // Fulfill the reward
      const reward = this.#customRewards.find((data) => {
        return data.type == "skip_queue";
      });
      if (reward == undefined || reward.id == null) {
        throw new Error("unreachable"); // If the user is in the skip queue, the reward *must* exist
      }
      void twitchApi.updateCustomRewardRedemption(
        reward.id,
        nextSubmitter.redemptionId,
        "FULFILLED"
      );

      // Return the submitter
      return nextSubmitter;
    }
    this.#spacingCounter -= 1;
    return "not yet";
  }

  public decSpacingCounter() {
    this.#spacingCounter -= 1;
  }

  public removeFromSkipQueue(
    remove: QueueSubmitter,
    status: "FULFILLED" | "CANCELED" = "CANCELED"
  ) {
    const skipper = this.#skipQueue.find((user) => user.id == remove.id);

    if (skipper != undefined) {
      // Remove the user from the skip queue
      this.#skipQueue = this.#skipQueue.filter((user) => user.id != remove.id);

      // Try to fulfill or refund their redemption
      const reward = this.#customRewards.find((data) => {
        return data.type == "skip_queue";
      });
      if (reward == undefined || reward.id == null) {
        return; // Not sure how we got here, but it's fine. We removed them from the skip queue already anyway.
      }
      void twitchApi.updateCustomRewardRedemption(
        reward.id,
        skipper.redemptionId,
        status
      );
    }
  }
}

export const channelPointManager = new ChannelPointManager();
