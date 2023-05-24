import settings from "./settings.js";
import { OnlineUsers, twitch } from "./twitch.js";
import { setIntervalAsync } from "set-interval-async/dynamic";
import * as persistence from "./persistence.js";
import Waiting from "./waiting.js";
import { Extensions } from "./extensions.js";
import {
  PersistedQueueEntry,
  QueueEntry,
  QueueSubmitter,
  User,
  isQueueSubmitter,
} from "./extensions-api/queue-entry.js";
import { Chatter, Responder } from "./extensions-api/command.js";
import { z } from "zod";
import i18next from "i18next";
import timestring from "timestring";
import humanizeDuration from "humanize-duration";
import { twitchApi } from "./twitch-api.js";

const extensions = new Extensions();

function isChannel(submitter: QueueSubmitter): boolean {
  const channelSubmitter: Partial<QueueSubmitter> = {
    name: settings.channel,
  };
  return isQueueSubmitter(submitter, channelSubmitter);
}

export type OnlineOfflineList = {
  online: QueueEntry[];
  offline: QueueEntry[];
};

export type WeightedListEntry = {
  level: QueueEntry;
  weight: () => number;
  position: number;
};

export type WeightedList = {
  totalWeight: number;
  entries: WeightedListEntry[];
  offlineLength: number;
};

let loaded = false;
let persist = true; // if false the queue will not save automatically
let streamLastOnline: boolean | null = null;

interface QueueDataAccessor {
  get current_level(): QueueEntry | undefined;
  set current_level(value: QueueEntry | undefined);
  get levels(): QueueEntry[];
  set levels(value: QueueEntry[]);
  get waitingByUserId(): Record<string, Waiting>;
  set waitingByUserId(value: Record<string, Waiting>);

  /**
   * Saves at the end of the critical section
   */
  saveLater(options?: { force?: boolean }): void;

  /**
   * Saves the current state right now.
   *
   * @returns true if and only if saving was successful.
   */

  saveNow(options?: { force?: boolean }): boolean;

  /**
   * Remove the waiting entry of the `current_level` now.
   */
  removeWaiting(): void;

  override(state: z.output<typeof persistence.QueueV3>): void;

  /**
   * This method has to be called with every level that is removed from the queue!
   */
  onRemove(removedLevels: QueueEntry[]): void;
}

export type QueueDataMap<T> = (data: QueueDataAccessor) => T;

class QueueData {
  private currentLevel: QueueEntry | null = null;
  private levels: QueueEntry[] = [];
  private waitingByUserId: Record<string, Waiting> = {};
  private currentAccessor:
    | (QueueDataAccessor & { save: false | { force: boolean } })
    | null = null;

  private accessor(): QueueDataAccessor & { save: false | { force: boolean } } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const data = this;
    return {
      save: false,
      get current_level() {
        return data.currentLevel ?? undefined;
      },
      set current_level(value) {
        data.currentLevel = value ?? null;
      },
      get levels() {
        return data.levels;
      },
      set levels(value) {
        data.levels = value;
      },
      get waitingByUserId() {
        if (data.waitingByUserId == null) {
          throw new Error("waiting is not initialized");
        }
        return data.waitingByUserId;
      },
      set waitingByUserId(value) {
        data.waitingByUserId = value;
      },
      saveLater(options) {
        const force = options?.force ?? false;
        if (this.save !== false) {
          this.save.force ||= force;
        } else {
          this.save = { force };
        }
      },
      saveNow(options: { force: boolean } = { force: false }) {
        if (persist || options.force === true) {
          const serializedCurrentLevel: PersistedQueueEntry | null =
            this.current_level?.serializePersistedQueueEntry() ?? null;
          return persistence.saveQueueSync({
            entries: {
              current: serializedCurrentLevel,
              queue: this.levels.map((level) =>
                level.serializePersistedQueueEntry()
              ),
            },
            waiting: Waiting.recordToJson(this.waitingByUserId),
            // TODO: add test case to check that only data and version are persisted
            extensions: extensions.persistedQueueBindings(),
          });
        } else {
          return false;
        }
      },

      override(state: z.output<typeof persistence.QueueV3>) {
        let save = false;
        // override queue bindings
        extensions.overrideQueueBindings(state.extensions);

        // upgrade levels that do not have their type set
        const allPersistedEntries = (
          state.entries.current == null ? [] : [state.entries.current]
        ).concat(state.entries.queue);
        save = extensions.upgradeEntries(allPersistedEntries) || save;

        // deserialize all entries
        if (state.entries.current == null) {
          this.current_level = undefined;
        } else {
          this.current_level = extensions.deserialize(state.entries.current);
        }
        this.levels = state.entries.queue.map((level) =>
          extensions.deserialize(level)
        );

        // create object from waiting list
        this.waitingByUserId = Waiting.fromList(state.waiting);

        // check for missing users in waitingByUserId (current level does not have a waiting time!)
        const now = new Date();
        this.levels
          .filter((level) => !(level.submitter.id in this.waitingByUserId))
          .forEach((level) => {
            console.warn(
              `User ${level.submitter.toString()} didn't have a waiting time!`
            );
            this.waitingByUserId[level.submitter.id] = Waiting.create(
              level.submitter,
              now
            );
            save = true;
          });

        // get all level entries including the current level
        const allEntries = (
          this.current_level === undefined ? [] : [this.current_level]
        ).concat(this.levels);

        // extensions can now check their entries
        save = extensions.checkEntries(allEntries) || save;

        // set save handler -> from now on it is save to save!
        extensions.setQueueBindingSaveHandler(() => {
          if (data.currentAccessor != null) {
            // can not save now since a different path of the queue is currently accessing the critical section
            data.currentAccessor.saveLater();
          } else {
            data.accessor().saveNow();
          }
        });

        if (save) {
          this.saveLater();
        }
      },

      removeWaiting() {
        if (this.current_level == undefined) {
          console.warn("removeWaiting called with no current level");
          return;
        }
        if (
          Object.prototype.hasOwnProperty.call(
            data.waitingByUserId,
            this.current_level.submitter.id
          )
        ) {
          delete this.waitingByUserId[this.current_level.submitter.id];
        }
      },

      /**
       * this is called every time levels are removed from the queue
       * this can include the current_level
       */
      onRemove(removedLevels: QueueEntry[]) {
        // unlurk anyone that is removed from the queue
        removedLevels.forEach((level) =>
          twitch.notLurkingAnymore(level.submitter)
        );
        // check if romhack levels or uncleared levels are disabled and need to be removed
        const allEntries = (
          this.current_level === undefined ? [] : [this.current_level]
        ).concat(data.levels);
        extensions.checkEntries(allEntries);
      },
    };
  }

  access<T, Args extends unknown[] = []>(
    fn: (accessor: QueueDataAccessor, ...args: Args) => T,
    ...args: Args
  ): T {
    if (this.currentAccessor != null) {
      throw new Error(
        "Accessing queue state while it is already being accessed"
      );
    }
    const accessor = this.accessor();
    this.currentAccessor = accessor;
    const result = fn(accessor, ...args);
    if (accessor.save !== false) {
      accessor.saveNow(accessor.save);
    }
    this.currentAccessor = null;
    return result;
  }

  async load() {
    // load queue state
    const state = await persistence.loadQueue({ save: persist });
    this.access((data) => {
      data.override(state);
    });
  }
}

const data = new QueueData();

function partition<T>(
  list: T[],
  predicate: (value: T, index: number, array: T[]) => boolean,
  thisArg?: unknown
): [T[], T[]] {
  const listTrue = [];
  const listFalse = [];
  for (let index = 0; index < list.length; index++) {
    const value = list[index];
    if (predicate.call(thisArg, value, index, list)) {
      listTrue.push(value);
    } else {
      listFalse.push(value);
    }
  }
  return [listTrue, listFalse];
}

const queue = {
  add: (levelCode: string, submitter: QueueSubmitter) => {
    return data.access((data) => {
      if (settings.max_size && data.levels.length >= settings.max_size) {
        return i18next.t("queueFull");
      }
      const resolved = extensions.resolve(levelCode, submitter);
      if (!resolved.success) {
        // TODO: maybe display all the code types that are not valid
        return i18next.t("invalidCode", { submitter });
      }

      const level = resolved.entry;
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter) &&
        !isChannel(submitter)
      ) {
        return i18next.t("pleaseWaitQueue");
      }

      const result = data.levels.find((x) => x.submitter.equals(submitter));
      if (result == undefined || isChannel(submitter)) {
        data.levels.push(level);
        // add wait time of 1 and add last online time of now
        if (!(submitter.id in data.waitingByUserId)) {
          data.waitingByUserId[submitter.id] = Waiting.create(submitter);
        }
        data.saveLater();
        return i18next.t("addedToQueue", { level });
      } else {
        return i18next.t("alreadyInQueue", { submitter });
      }
    });
  },

  modRemove: (usernameArgument: string) => {
    return data.access((data) => {
      if (usernameArgument == "") {
        return i18next.t("modRemoveNoArgument");
      }

      const level = data.levels.find(
        queue.matchUsernameArgument(usernameArgument)
      );
      if (!level) {
        const usernameOrDisplayName = usernameArgument.trim().replace(/^@/, "");
        // If the user isn't in the queue, unlurk them anyway
        // It's unlikely they'll be on BRB and not in queue, but it's an edge case worth covering
        // `notLurkingAnymore` is called twice, because using both `name` and `displayName` would only match on `name` and not both
        twitch.notLurkingAnymore({ name: usernameOrDisplayName });
        twitch.notLurkingAnymore({ displayName: usernameOrDisplayName });
        return i18next.t("modRemoveNotFound", { usernameArgument });
      }
      const submitter = level.submitter;
      let removedLevels;
      [removedLevels, data.levels] = partition(
        data.levels,
        queue.matchSubmitter(submitter)
      );
      data.onRemove(removedLevels);
      data.saveLater();
      return i18next.t("modRemoveRemoved", { usernameArgument });
    });
  },

  remove: (submitter: QueueSubmitter) => {
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        return i18next.t("removeCurrentLevel");
      }
      let removedLevels;
      [removedLevels, data.levels] = partition(
        data.levels,
        queue.matchSubmitter(submitter)
      );
      if (removedLevels.length === 0) {
        return i18next.t("submitterNotFound", { submitter });
      }
      data.onRemove(removedLevels);
      data.saveLater();
      return i18next.t("removeRemoved", { submitter });
    });
  },

  replace: (submitter: QueueSubmitter, levelCode: string) => {
    return data.access((data) => {
      const resolved = extensions.resolve(levelCode, submitter);
      if (!resolved.success) {
        // TODO: maybe display all the code types that are not valid
        return i18next.t("invalidCode", { submitter });
      }
      const level = resolved.entry;
      const levelIndex = data.levels.findIndex(queue.matchSubmitter(submitter));
      if (levelIndex != -1) {
        data.levels[levelIndex] = level;
        data.saveLater();
        return i18next.t("replaceReplaced", { level });
      } else if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        data.current_level = level;
        data.saveLater();
        return i18next.t("replaceReplaced", { level });
      } else {
        return i18next.t("submitterNotFound");
      }
    });
  },

  position: async (
    submitter: QueueSubmitter,
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ): Promise<number> => {
    let getList: QueueDataMap<OnlineOfflineList>;
    if (list === undefined) {
      getList = await queue.list();
    } else {
      getList = list;
    }
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        return 0;
      }
      if (data.levels.length == 0) {
        return -1;
      }

      const list = getList(data);
      const both = list.online.concat(list.offline);
      const index = both.findIndex(queue.matchSubmitter(submitter));
      if (index != -1) {
        return index + 1 + (data.current_level != undefined ? 1 : 0);
      }
      return -1;
    });
  },

  absolutePosition: (submitter: QueueSubmitter): Promise<number> => {
    return Promise.resolve(
      data.access((data) => {
        if (
          data.current_level != undefined &&
          data.current_level.submitter.equals(submitter)
        ) {
          return 0;
        }
        if (data.levels.length == 0) {
          return -1;
        }
        const index = data.levels.findIndex(queue.matchSubmitter(submitter));
        if (index != -1) {
          return index + 1 + (data.current_level != undefined ? 1 : 0);
        }
        return -1;
      })
    );
  },

  weightedPosition: async (
    submitter: QueueSubmitter,
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ): Promise<number> => {
    const getWeightedList = await queue.weightedList(true, list);
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        return 0;
      }
      if (data.levels.length == 0) {
        return -1;
      }
      if (twitch.checkLurk(submitter)) {
        return -2;
      }
      const weightedList = getWeightedList(data);
      const index = weightedList.entries
        .map((entry) => entry.level)
        .findIndex(queue.matchSubmitter(submitter));
      if (index != -1) {
        return index + 1 + (data.current_level != undefined ? 1 : 0);
      }
      return -1;
    });
  },

  modSubmittedLevel: (
    submitter: string
  ):
    | { result: "no-submitter" | "not-found" }
    | { result: "current" | "level"; level: QueueEntry } => {
    if (submitter == "") {
      return { result: "no-submitter" };
    }
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        queue.matchUsernameArgument(submitter)(data.current_level)
      ) {
        return { result: "current", level: data.current_level };
      }
      const level = data.levels.find(queue.matchUsernameArgument(submitter));
      if (level !== undefined) {
        return { result: "level", level };
      } else {
        return { result: "not-found" };
      }
    });
  },

  submittedlevel: async (submitter: QueueSubmitter) => {
    const getList = await queue.list();
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        return 0;
      }

      const list = getList(data);
      const both = list.online.concat(list.offline);
      const index = both.findIndex(queue.matchSubmitter(submitter));
      if (index != -1) {
        return both[index];
      }
      return -1;
    });
  },

  weightedchance: async (submitter: QueueSubmitter) => {
    const getWeightedList = await queue.weightedList(false);
    return data.access((data) => {
      if (
        data.current_level != undefined &&
        data.current_level.submitter.equals(submitter)
      ) {
        return 0;
      }
      if (data.levels.length == 0) {
        return -1;
      }
      if (twitch.checkLurk(submitter)) {
        return -2;
      }

      const weightedList = getWeightedList(data);

      if (weightedList.entries.length == 0) {
        return -1;
      }

      const index = weightedList.entries
        .map((entry) => entry.level)
        .findIndex(queue.matchSubmitter(submitter));

      if (index != -1) {
        console.log(
          i18next.t("eligibleUsers", {
            users: weightedList.entries.map((entry) =>
              entry.level.submitter.toString()
            ),
            style: "short",
            type: "unit",
          })
        );
        console.log(
          i18next.t("eligibleUsersTime", {
            weights: weightedList.entries.map((entry) => entry.weight()),
            style: "short",
            type: "unit",
          })
        );
        const weight = weightedList.entries[index].weight();
        const totalWeight = weightedList.totalWeight;
        console.log(
          i18next.t("consolePrintWeight", { submitter, weight, totalWeight })
        );
        const percent = weight / totalWeight;
        return i18next.t("genericPercentage", {
          percent,
          style: "percent",
          maximumFractionDigits: 1,
          maximumSignificantDigits: 3,
          roundingPriority: "morePrecision",
          roundingMode: "halfTrunc",
        });
      }
      return -1;
    });
  },

  punt: (): Promise<string> => {
    return Promise.resolve(
      data.access((data) => {
        if (data.current_level === undefined) {
          return i18next.t("puntNoLevel");
        }
        const top = data.current_level;
        data.current_level = undefined;
        data.levels.push(top);
        if (
          !Object.prototype.hasOwnProperty.call(
            data.waitingByUserId,
            top.submitter.id
          )
        ) {
          data.waitingByUserId[top.submitter.id] = Waiting.create(
            top.submitter
          );
        }
        data.saveLater();
        return i18next.t("puntPunted");
      })
    );
  },

  dismiss: (): Promise<string> => {
    return Promise.resolve(
      data.access((data) => {
        if (data.current_level === undefined) {
          return i18next.t("dismissNoLevel");
        }
        const response = i18next.t("dismissDismissed", { data });
        const removedLevels =
          data.current_level === undefined ? [] : [data.current_level];
        data.current_level = undefined;
        data.onRemove(removedLevels);
        data.saveLater();
        return response;
      })
    );
  },

  next: async (
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ) => {
    let getList: QueueDataMap<OnlineOfflineList>;
    if (list === undefined) {
      getList = await queue.list(true);
    } else {
      getList = list;
    }
    let online = true;
    return data.access((data) => {
      const list = getList(data);
      const both = list.online.concat(list.offline);
      const removedLevels =
        data.current_level === undefined ? [] : [data.current_level];
      if (both.length === 0) {
        data.current_level = undefined;
        data.onRemove(removedLevels);
        data.saveLater();
        return data.current_level;
      } else {
        if (both.length == list.offline.length) {
          online = false;
        }
        data.current_level = both.shift();
        data.removeWaiting();
      }
      const index = data.levels.findIndex(
        (level) => level === data.current_level
      );
      if (index == -1 || data.current_level == undefined) {
        // data.current_level should never be undefined by this point
        // and it should always be in the list of levels
        throw new Error("unreachable");
      }
      data.levels.splice(index, 1);
      data.onRemove(removedLevels);
      data.saveLater();
      return { ...data.current_level, online };
    });
  },

  subnext: async () => {
    const list = await queue.sublist(true);
    return await queue.next(list);
  },

  modnext: async () => {
    const list = await queue.modlist(true);
    return await queue.next(list);
  },

  dip: (usernameArgument: string) => {
    return data.access((data) => {
      const index = data.levels.findIndex(
        queue.matchUsernameArgument(usernameArgument)
      );
      if (index != -1) {
        const removedLevels =
          data.current_level === undefined ? [] : [data.current_level];
        data.current_level = data.levels[index];
        data.removeWaiting();
        data.levels.splice(index, 1);
        data.onRemove(removedLevels);
        data.saveLater();
        return data.current_level;
      }
      return undefined;
    });
  },

  current: () => {
    return data.access((data) => data.current_level);
  },

  random: async (
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ) => {
    let getList: QueueDataMap<OnlineOfflineList>;
    if (list === undefined) {
      getList = await queue.list(true);
    } else {
      getList = list;
    }
    let online = true;
    return data.access((data) => {
      const list = getList(data);
      const removedLevels =
        data.current_level === undefined ? [] : [data.current_level];
      let eligible_levels = list.online;
      if (eligible_levels.length == 0) {
        eligible_levels = list.offline;
        online = false;
        if (eligible_levels.length == 0) {
          data.current_level = undefined;
          data.onRemove(removedLevels);
          data.saveLater();
          return data.current_level;
        }
      }

      const random_index = Math.floor(Math.random() * eligible_levels.length);
      data.current_level = eligible_levels[random_index];
      const index = data.levels.findIndex(
        (level) => level === data.current_level
      );
      if (index == -1) {
        throw new Error("unreachable");
      }
      data.removeWaiting();
      data.levels.splice(index, 1);
      data.onRemove(removedLevels);
      data.saveLater();
      return { online, ...data.current_level };
    });
  },

  subrandom: async () => {
    const list = await queue.sublist(true);
    return await queue.random(list);
  },

  modrandom: async () => {
    const list = await queue.modlist(true);
    return await queue.random(list);
  },

  weightedrandom: async (
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ) => {
    const getWeightedList = await queue.weightedList(false, list, true);
    const online = true; // Always true with the current setup
    return data.access((data) => {
      const weightedList = getWeightedList(data);
      const removedLevels =
        data.current_level === undefined ? [] : [data.current_level];

      if (weightedList.entries.length == 0) {
        data.current_level = undefined;
        data.onRemove(removedLevels);
        data.saveLater();
        return data.current_level;
      }

      const totalWeight = weightedList.totalWeight;
      const randomNumber = Math.floor(Math.random() * totalWeight) + 1;
      let levelIndex = 0;
      let gettingThereSomeday = weightedList.entries[0].weight();

      console.log(
        i18next.t("eligibleUsers", {
          users: weightedList.entries.map((entry) =>
            entry.level.submitter.toString()
          ),
          style: "short",
          type: "unit",
        })
      );
      console.log(
        i18next.t("eligibleUsersTime", {
          weights: weightedList.entries.map((entry) => entry.weight()),
          style: "short",
          type: "unit",
        })
      );

      console.log(i18next.t("randomNumber", { randomNumber }));
      console.log(i18next.t("currentCumulativeTime", { gettingThereSomeday }));
      while (gettingThereSomeday < randomNumber) {
        levelIndex++;
        gettingThereSomeday =
          gettingThereSomeday + weightedList.entries[levelIndex].weight();
        console.log(
          i18next.t("currentCumulativeTime", { gettingThereSomeday })
        );
      }

      console.log(
        i18next.t("consoleIndexChosen", { levelIndex, gettingThereSomeday })
      );
      data.current_level = weightedList.entries[levelIndex].level;

      const index = data.levels.findIndex(
        (level) => level === data.current_level
      );
      if (index == -1) {
        throw new Error("unreachable");
      }
      data.levels.splice(index, 1);

      const percent = weightedList.entries[levelIndex].weight() / totalWeight;
      const selectionChance = i18next.t("genericPercentage", {
        percent,
        style: "percent",
        maximumFractionDigits: 1,
        maximumSignificantDigits: 3,
        roundingPriority: "morePrecision",
        roundingMode: "halfTrunc",
      });

      data.removeWaiting();
      data.onRemove(removedLevels);
      data.saveLater();

      return { ...data.current_level, selectionChance, online };
    });
  },

  weightedList: async (
    sorted: boolean | undefined = undefined,
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined,
    forceRefresh = false
  ): Promise<QueueDataMap<WeightedList>> => {
    let getList: QueueDataMap<OnlineOfflineList>;
    if (list === undefined) {
      getList = await queue.list(forceRefresh);
    } else {
      getList = list;
    }
    return (data) => {
      const list = getList(data);
      const online_users = list.online;
      if (
        online_users.length == 0 ||
        Object.keys(data.waitingByUserId).length == 0
      ) {
        return {
          totalWeight: 0,
          entries: [],
          offlineLength: list.offline.length + online_users.length,
        };
      }

      let entries = online_users
        .filter((level) =>
          Object.prototype.hasOwnProperty.call(
            data.waitingByUserId,
            level.submitter.id
          )
        )
        .map((level, position) => {
          return {
            weight: () => data.waitingByUserId[level.submitter.id].weight(),
            position: position,
            level: level,
          };
        });

      if (sorted === undefined || sorted) {
        entries = entries.sort(
          (a, b) => b.weight() - a.weight() || a.position - b.position
        );
      }

      const totalWeight = entries.reduce(
        (sum, entry) => sum + entry.weight(),
        0
      );

      return {
        totalWeight: totalWeight,
        entries: entries,
        offlineLength:
          list.offline.length + (online_users.length - entries.length),
      };
    };
  },

  multiplier: (submitter: QueueSubmitter) => {
    if (settings.subscriberWeightMultiplier && twitch.isSubscriber(submitter)) {
      return settings.subscriberWeightMultiplier;
    }
    return 1.0;
  },

  weightednext: async (
    list: QueueDataMap<OnlineOfflineList> | undefined = undefined
  ): Promise<
    (QueueEntry & { selectionChance: string; online: boolean }) | undefined
  > => {
    const getWeightedList = await queue.weightedList(true, list, true);
    const online = true; // Always true with the current setup
    return data.access((data) => {
      const weightedList = getWeightedList(data);
      const removedLevels =
        data.current_level === undefined ? [] : [data.current_level];

      if (weightedList.entries.length == 0) {
        data.current_level = undefined;
        data.onRemove(removedLevels);
        data.saveLater();
        return data.current_level;
      }

      data.current_level = weightedList.entries[0].level;

      // index of the level can be different than 0
      const index = data.levels.findIndex(
        (level) => level === data.current_level
      );
      if (index == -1) {
        throw new Error("unreachable");
      }
      data.levels.splice(index, 1);

      const percent =
        weightedList.entries[0].weight() / weightedList.totalWeight;
      const selectionChance = i18next.t("genericPercentage", {
        percent,
        style: "percent",
        maximumFractionDigits: 1,
        maximumSignificantDigits: 3,
        roundingPriority: "morePrecision",
        roundingMode: "halfTrunc",
      });

      data.removeWaiting();
      data.onRemove(removedLevels);
      data.saveLater();

      return { ...data.current_level, selectionChance, online };
    });
  },

  weightedsubrandom: async () => {
    const list = await queue.sublist(true);
    return await queue.weightedrandom(list);
  },

  weightedsubnext: async () => {
    const list = await queue.sublist(true);
    return await queue.weightednext(list);
  },

  renameAndPartition: (
    onlineUsers: OnlineUsers
  ): QueueDataMap<OnlineOfflineList> => {
    return (data: QueueDataAccessor) => {
      const [online, offline] = partition(data.levels, (level) => {
        const onlineUser = onlineUsers.getOnlineUser(level.submitter);
        if ("user" in onlineUser) {
          // automatically rename on name change
          level.rename(onlineUser.user);
        }
        return onlineUser.online;
      });
      return { online, offline };
    };
  },

  list: async (
    forceRefresh = false
  ): Promise<QueueDataMap<OnlineOfflineList>> => {
    const onlineUsers = await twitch.getOnlineUsers(forceRefresh);
    return queue.renameAndPartition(onlineUsers);
  },

  sublist: async (
    forceRefresh = false
  ): Promise<QueueDataMap<OnlineOfflineList>> => {
    const onlineUsers = await twitch.getOnlineSubscribers(forceRefresh);
    return queue.renameAndPartition(onlineUsers);
  },

  modlist: async (
    forceRefresh = false
  ): Promise<QueueDataMap<OnlineOfflineList>> => {
    const onlineUsers = await twitch.getOnlineMods(forceRefresh);
    return queue.renameAndPartition(onlineUsers);
  },

  matchSubmitter: (submitter: QueueSubmitter) => {
    return (level: QueueEntry) => level.submitter.equals(submitter);
  },

  matchUsernameArgument: (usernameArgument: string) => {
    usernameArgument = usernameArgument.trim().replace(/^@/, "");
    return (level: QueueEntry) => {
      // display name (submitter) or user name (username) matches
      // `isSubmitter` has to be called twice here, since only `name` is checked if both `name` and `displayName` are set
      return (
        level.submitter.equals({ name: usernameArgument }) ||
        level.submitter.equals({ displayName: usernameArgument })
      );
    };
  },

  persistenceManagement: async (subCommand: string) => {
    if (subCommand == "on") {
      persist = true;
      return i18next.t("persistenceActivated");
    } else if (subCommand == "off") {
      persist = false;
      return i18next.t("persistenceDeactivated");
    } else if (subCommand == "save") {
      // force save
      const success = data.access((data) => data.saveNow({ force: true }));
      if (success) {
        return i18next.t("persistenceSaved");
      } else {
        return i18next.t("persistenceError");
      }
    } else if (
      subCommand == "load" ||
      subCommand == "reload" ||
      subCommand == "restore"
    ) {
      // load queue state
      await data.load();
      return i18next.t("persistenceReloaded");
    } else {
      return i18next.t("persistenceInvalid");
    }
  },

  isPersisting: () => {
    return persist;
  },

  handleCommands: async (
    message: string,
    sender: Chatter,
    respond: Responder
  ) => {
    return await extensions.handleCommands(message, sender, respond);
  },

  load: async () => {
    if (loaded) {
      // only reload queue state
      await data.load();
      // do not setup the timer again or reload custom codes
      return;
    }

    // load extensions
    await extensions.load();

    // load queue state
    await data.load();

    // Start the waiting time timer
    setIntervalAsync(queue.waitingTimerTick, 60000);

    loaded = true;
  },

  waitingTimerTick: async () => {
    const streamOnline = await twitchApi.isStreamOnline();
    if (streamLastOnline !== streamOnline) {
      streamLastOnline = streamOnline;
      const args = {
        time: new Date().toISOString(), // printing the time as ISO instead of using the localized time representation
      };
      if (streamOnline) {
        console.log(i18next.t("streamIsOnline", args));
      } else {
        console.log(i18next.t("streamIsOffline", args));
      }
    }
    if (!streamOnline) {
      return;
    }
    const list = await queue.list();
    data.access((data) => {
      const now = new Date();
      list(data)
        .online.map((v) => v.submitter)
        .forEach((submitter) => {
          if (
            Object.prototype.hasOwnProperty.call(
              data.waitingByUserId,
              submitter.id
            )
          ) {
            const waiting = data.waitingByUserId[submitter.id];
            waiting.addOneMinute(queue.multiplier(submitter), now);
            // try to automatically rename user if the name changes
            waiting.rename(submitter);
          } else {
            data.waitingByUserId[submitter.id] = Waiting.create(submitter, now);
          }
        });
      // TODO: maybe increase the last online time even for people who are currently lurking but online
      data.saveLater();
    });
  },

  parseClearArgument: (
    what: string | null
  ):
    | { result: "invalid"; reason: "empty" | "format" }
    | { result: "all" | "deleted" }
    | { result: "duration"; durationMilliseconds: number } => {
    if (what == null) {
      return { result: "invalid", reason: "empty" };
    }
    what = what.trim();
    if (what == "") {
      return { result: "invalid", reason: "empty" };
    }
    const whatLowerCase = what.toLowerCase();
    if (["a", "all"].includes(whatLowerCase)) {
      return { result: "all" };
    } else if (["d", "del", "delete", "deleted"].includes(whatLowerCase)) {
      return { result: "deleted" };
    }
    try {
      return {
        result: "duration",
        durationMilliseconds: timestring(what, "milliseconds"),
      };
    } catch (e) {
      return { result: "invalid", reason: "format" };
    }
  },

  clear: async (what?: string, respond?: Responder): Promise<string | null> => {
    let clearResult = queue.parseClearArgument(what ?? null);
    if (clearResult.result == "invalid" && clearResult.reason == "empty") {
      clearResult = queue.parseClearArgument(settings.clear);
    }
    if (clearResult.result == "all") {
      // all
      return data.access((data) => {
        twitch.clearLurkers(); // clear all lurkers, since people who are not in the queue could be lurking
        data.current_level = undefined;
        const removedLevels = data.levels;
        data.levels = [];
        data.onRemove(removedLevels);
        data.saveLater();
        return i18next.t("queueCleared");
      });
    } else if (clearResult.result == "deleted") {
      // collect user ids first
      const userIds = data.access((data) => {
        const userIds = new Set<string>();
        if (data.current_level !== undefined) {
          userIds.add(data.current_level.submitter.id);
        }
        data.levels.forEach((level) => userIds.add(level.submitter.id));
        Object.keys(data.waitingByUserId).forEach((id) => userIds.add(id));
        return userIds;
      });
      const lookupIds: string[] = [...userIds];
      if (lookupIds.length == 0) {
        return i18next.t("queueClearDeletedNoUsers");
      }
      if (respond !== undefined) {
        respond(
          i18next.t("queueClearDeletedInfo", { users: lookupIds.length })
        );
      }
      // create all requests
      const usersMap = new Map<string, User>();
      while (lookupIds.length > 0) {
        const upgradeNumber = Math.min(100, lookupIds.length);
        console.log(
          `Checking ${upgradeNumber} out of ${lookupIds.length} users for deletion...`
        );
        const next100: string[] = lookupIds.splice(0, upgradeNumber);
        const users = await twitchApi.getUsersById(next100);
        users.forEach((user) => void usersMap.set(user.id, user));
      }
      return data.access((data) => {
        // the data could have changed in the meantime! (levels added, removed; weights changed; etc.)
        let removedLevels;
        const renamedUsers = new Set<string>();
        const removeLevelOrRename = (level: QueueEntry) => {
          const id = level.submitter.id;
          // only check users that were requested originally
          if (userIds.has(id)) {
            const user = usersMap.get(id);
            if (user == null) {
              // user was in the request, but not in the response
              // this means that the user was deleted
              return true;
            } else {
              // otherwise we can rename the submitter if the name or display name changed
              if (level.rename(user)) {
                renamedUsers.add(id);
              }
            }
          }
          return false;
        };
        [removedLevels, data.levels] = partition(
          data.levels,
          removeLevelOrRename
        );
        if (
          data.current_level !== undefined &&
          removeLevelOrRename(data.current_level)
        ) {
          removedLevels.push(data.current_level);
          data.current_level = undefined;
        }
        data.onRemove(removedLevels);
        // in this step we can also remove the waiting time (which isn't removed otherwise)
        // because the waiting time is not needed for deleted users
        for (const id of Object.keys(data.waitingByUserId)) {
          if (userIds.has(id)) {
            const user = usersMap.get(id);
            if (user == null) {
              delete data.waitingByUserId[id];
            } else {
              if (data.waitingByUserId[id].rename(user)) {
                renamedUsers.add(id);
              }
            }
          }
        }
        data.saveLater();
        if (data.levels.length == 0) {
          // all levels were cleared, lets clear all lurkers (no need to check current level)
          twitch.clearLurkers();
        }
        const renamedUsersSize = renamedUsers.size;
        return i18next.t("queueClearDeletedResult", {
          removed: removedLevels.length,
          renamed: renamedUsersSize,
        });
      });
    } else if (clearResult.result == "duration") {
      // older than {duration}
      // note that the date added is not used, but instead the last online time of the submitter
      const duration = clearResult.durationMilliseconds;
      const time = Date.now() - clearResult.durationMilliseconds;
      return data.access((data) => {
        let removedLevels;
        const removeLevel = (level: QueueEntry) =>
          data.waitingByUserId[level.submitter.id].isOlderThan(time);
        [removedLevels, data.levels] = partition(data.levels, removeLevel);

        // note: the current level does not have a waiting time so it is never removed!

        data.onRemove(removedLevels);
        data.saveLater();
        if (data.levels.length == 0) {
          // all levels were cleared, lets clear all lurkers (no need to check current level)
          twitch.clearLurkers();
        }
        return i18next.t("queueClearDurationResult", {
          removed: removedLevels.length,
          duration: humanizeDuration(duration, {
            language: settings.language,
            fallbacks: ["en"],
          }),
        });
      });
    } else {
      return i18next.t("queueClearUsage");
    }
  },

  level_list_message: async () => {
    const getList = await queue.list();
    return data.access((data) => {
      const current = data.current_level;
      const levels = getList(data);
      if (
        current === undefined &&
        levels.online.length === 0 &&
        levels.offline.length === 0
      ) {
        return i18next.t("queueEmpty");
      }

      const onlineList = levels.online
        .slice(0, 5)
        .map((entry) => entry.submitter.displayName);

      let onlineLength = levels.online.length;
      const ellipsis = (() => {
        if (onlineLength > 5) {
          return "$t(ellipsis)";
        } else {
          return "";
        }
      })();

      if (current !== undefined) {
        onlineLength += 1;
        if (onlineLength == 1) {
          return i18next.t("queueListCurrentOnly", {
            onlineLength,
            levels,
            current,
          });
        }
        return i18next.t("queueListCurrent", {
          onlineLength,
          levels,
          current,
          onlineList,
          ellipsis,
          style: "short",
          type: "unit",
        });
      } else {
        return i18next.t("queueListNoCurrent", {
          onlineLength,
          levels,
          onlineList,
          ellipsis,
          style: "short",
          type: "unit",
        });
      }
    });
  },

  level_weighted_list_message: async () => {
    const getWeightedList = await queue.weightedList(true);
    return data.access((data) => {
      const current = data.current_level;
      const weightedList = getWeightedList(data);
      if (
        current === undefined &&
        weightedList.entries.length === 0 &&
        weightedList.offlineLength === 0
      ) {
        return i18next.t("queueEmpty");
      }

      const onlineList = weightedList.entries.slice(0, 5).map((entry) => {
        const percent = entry.weight() / weightedList.totalWeight;
        return i18next.t("submitterPercentage", {
          submitter: entry.level.submitter.displayName,
          percent,
          style: "percent",
          maximumFractionDigits: 1,
          maximumSignificantDigits: 3, // this combined with...
          roundingPriority: "morePrecision", // ...this means that we'll have "0.0693%" instead of "0.01%". still readable and more accurate!
          roundingMode: "halfTrunc", // And this will help avoid showing people 100% after rounding
        });
      });

      let onlineLength = weightedList.entries.length;
      const ellipsis = (() => {
        if (onlineLength > 5) {
          return "$t(ellipsis)";
        } else {
          return "";
        }
      })();

      if (current !== undefined) {
        onlineLength += 1;
        if (onlineLength == 1) {
          return i18next.t("weightedListCurrentOnly", {
            onlineLength,
            weightedList,
            current,
          });
        }
        return i18next.t("weightedListCurrent", {
          onlineLength,
          weightedList,
          current,
          onlineList,
          ellipsis,
          style: "short",
          type: "unit",
        });
      } else {
        return i18next.t("weightedListNoCurrent", {
          onlineLength,
          weightedList,
          onlineList,
          ellipsis,
          style: "short",
          type: "unit",
        });
      }
    });
  },

  testAccess:
    process && process.env && process.env.NODE_ENV == "test"
      ? data.access.bind(data)
      : undefined,
};

export type Queue = typeof queue;

export function quesoqueue() {
  return queue;
}
