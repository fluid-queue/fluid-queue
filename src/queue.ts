import settings from "./settings";
import { twitch } from "./twitch";
import { setIntervalAsync } from "set-interval-async/dynamic";
import * as persistence from "./persistence";
import Waiting from "./waiting";
import { Extensions } from "./extensions";
import {
  PersistedQueueEntry,
  QueueEntry,
  QueueSubmitter,
  isQueueSubmitter,
} from "./extensions-api/queue-entry";
import { Chatter, Responder } from "./extensions-api/command";

const extensions = new Extensions();

function isChannel(submitter: QueueSubmitter): boolean {
  const channelSubmitter: Partial<QueueSubmitter> = {
    login: settings.channel,
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
let current_level: QueueEntry | undefined;
let levels: QueueEntry[] = [];
let waiting: Record<string, Waiting>;
let persist = true; // if false the queue will not save automatically

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
    if (settings.max_size && levels.length >= settings.max_size) {
      return "Sorry, the level queue is full!";
    }
    const resolved = extensions.resolve(levelCode, submitter);
    if (!resolved.success) {
      // TODO: maybe display all the code types that are not valid
      return `${submitter}, that is an invalid level code.`;
    }

    const level = resolved.entry;
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter) &&
      !isChannel(submitter)
    ) {
      return "Please wait for your level to be completed before you submit again.";
    }

    const result = levels.find((x) => x.submitter.equals(submitter));
    if (result == undefined || isChannel(submitter)) {
      levels.push(level);
      // add wait time of 1 and add last online time of now
      if (!Object.prototype.hasOwnProperty.call(waiting, submitter.login)) {
        waiting[submitter.login] = Waiting.create();
      }
      queue.save();
      return `${level.submitter}, ${level} has been added to the queue.`;
    } else {
      return `Sorry, ${submitter}, you may only submit one level at a time.`;
    }
  },

  // this is called every time levels are removed from the queue
  // this can include the current_level
  onRemove: (removedLevels: QueueEntry[]) => {
    // unlurk anyone that is removed from the queue
    removedLevels.forEach((level) => twitch.notLurkingAnymore(level.submitter));
    // check if romhack levels or uncleared levels are disabled and need to be removed
    const allEntries = (
      current_level === undefined ? [] : [current_level]
    ).concat(levels);
    extensions.checkEntries(allEntries);
  },

  modRemove: (usernameArgument: string) => {
    if (usernameArgument == "") {
      return "You can use !remove <username> to kick out someone else's level.";
    }

    const level = levels.find(queue.matchUsernameArgument(usernameArgument));
    if (!level) {
      const usernameOrDisplayName = usernameArgument.trim().replace(/^@/, "");
      // If the user isn't in the queue, unlurk them anyway
      // It's unlikely they'll be on BRB and not in queue, but it's an edge case worth covering
      // `notLurkingAnymore` is called twice, because using both `login` and `displayName` would only match on `login` and not both
      twitch.notLurkingAnymore({ login: usernameOrDisplayName });
      twitch.notLurkingAnymore({ displayName: usernameOrDisplayName });
      return `No levels from ${usernameArgument} were found in the queue.`;
    }
    const submitter = level.submitter;
    let removedLevels;
    [removedLevels, levels] = partition(
      levels,
      queue.matchSubmitter(submitter)
    );
    queue.onRemove(removedLevels);
    queue.save();
    return `${usernameArgument}'s level has been removed from the queue.`;
  },

  remove: (submitter: QueueSubmitter) => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return "Sorry, we're playing that level right now!";
    }
    let removedLevels;
    [removedLevels, levels] = partition(
      levels,
      queue.matchSubmitter(submitter)
    );
    queue.onRemove(removedLevels);
    queue.save();
    return `${submitter}, your level has been removed from the queue.`;
  },

  replace: (submitter: QueueSubmitter, levelCode: string) => {
    const resolved = extensions.resolve(levelCode, submitter);
    if (!resolved.success) {
      // TODO: maybe display all the code types that are not valid
      return `${submitter}, that level code is invalid.`;
    }
    const level = resolved.entry;
    const levelIndex = levels.findIndex(queue.matchSubmitter(submitter));
    if (levelIndex != -1) {
      levels[levelIndex] = level;
      queue.save();
      return `${level.submitter}, your level in the queue has been replaced with ${level}.`;
    } else if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      current_level = level;
      queue.save();
      return `${level.submitter}, your level in the queue has been replaced with ${level}.`;
    } else {
      return `${submitter}, you were not found in the queue. Use !add to add a level.`;
    }
  },

  /** @type {(username: string, list?: OnlineOfflineList) => Promise<number>} */
  position: async (
    submitter: QueueSubmitter,
    list: OnlineOfflineList | undefined = undefined
  ): Promise<number> => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }

    if (list === undefined) {
      list = await queue.list();
    }
    const both = list.online.concat(list.offline);
    const index = both.findIndex(queue.matchSubmitter(submitter));
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  /** @type {(username: string) => Promise<number>} */
  absolutePosition: async (submitter: QueueSubmitter): Promise<number> => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    const index = levels.findIndex(queue.matchSubmitter(submitter));
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  /** @type {(username: string, list?: OnlineOfflineList) => Promise<number>} */
  weightedPosition: async (
    submitter: QueueSubmitter,
    list: OnlineOfflineList | undefined = undefined
  ): Promise<number> => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    if (twitch.checkLurk(submitter)) {
      return -2;
    }
    const weightedList = await queue.weightedList(true, list);
    const index = weightedList.entries
      .map((entry) => entry.level)
      .findIndex(queue.matchSubmitter(submitter));
    if (index != -1) {
      return index + 1 + (current_level != undefined ? 1 : 0);
    }
    return -1;
  },

  submittedlevel: async (submitter: QueueSubmitter) => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return 0;
    }

    const list = await queue.list();
    const both = list.online.concat(list.offline);
    const index = both.findIndex(queue.matchSubmitter(submitter));
    if (index != -1) {
      return both[index];
    }
    return -1;
  },

  weightedchance: async (submitter: QueueSubmitter) => {
    if (
      current_level != undefined &&
      current_level.submitter.equals(submitter)
    ) {
      return 0;
    }
    if (levels.length == 0) {
      return -1;
    }
    if (twitch.checkLurk(submitter)) {
      return -2;
    }

    const weightedList = await queue.weightedList(false);

    if (weightedList.entries.length == 0) {
      return -1;
    }

    const index = weightedList.entries
      .map((entry) => entry.level)
      .findIndex(queue.matchSubmitter(submitter));

    if (index != -1) {
      console.log(
        "Elegible users: " +
          weightedList.entries
            .map((entry) => entry.level.submitter.toString())
            .reduce((a, b) => a + ", " + b)
      );
      console.log(
        "Elegible users time: " +
          weightedList.entries.map((entry) => entry.weight())
      );
      const weight = weightedList.entries[index].weight();
      const totalWeight = weightedList.totalWeight;
      console.log(
        `${submitter}'s weight is ${weight} with totalWeight ${totalWeight}`
      );
      return queue.percent(weight, totalWeight);
    }
    return -1;
  },

  punt: async () => {
    if (current_level === undefined) {
      return "The nothing you aren't playing cannot be punted.";
    }
    const top = current_level;
    current_level = undefined;
    levels.push(top);
    if (!Object.prototype.hasOwnProperty.call(waiting, top.submitter.login)) {
      waiting[top.submitter.login] = Waiting.create();
    }
    queue.save();
    return "Ok, adding the current level back into the queue.";
  },

  dismiss: async () => {
    if (current_level === undefined) {
      return "The nothing you aren't playing cannot be dismissed.";
    }
    const response = `Dismissed ${current_level} submitted by ${current_level.submitter}.`;
    const removedLevels = current_level === undefined ? [] : [current_level];
    current_level = undefined;
    queue.onRemove(removedLevels);
    queue.save();
    return response;
  },

  next: async (list: OnlineOfflineList | undefined = undefined) => {
    if (list === undefined) {
      list = await queue.list(true);
    }
    const both = list.online.concat(list.offline);
    const removedLevels = current_level === undefined ? [] : [current_level];
    if (both.length === 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    } else {
      current_level = both.shift();
      queue.removeWaiting();
    }
    const index = levels.findIndex((level) => level === current_level);
    if (index == -1) {
      throw new Error("unreachable");
    }
    levels.splice(index, 1);
    queue.onRemove(removedLevels);
    queue.save();
    return current_level;
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
    const index = levels.findIndex(
      queue.matchUsernameArgument(usernameArgument)
    );
    if (index != -1) {
      const removedLevels = current_level === undefined ? [] : [current_level];
      current_level = levels[index];
      queue.removeWaiting();
      levels.splice(index, 1);
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }
    return undefined;
  },

  removeWaiting: () => {
    if (current_level == undefined) {
      console.warn("removeWaiting called with no current level");
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        waiting,
        current_level.submitter.login
      )
    ) {
      delete waiting[current_level.submitter.login];
    }
  },

  current: () => {
    return current_level;
  },

  random: async (list: OnlineOfflineList | undefined = undefined) => {
    if (list === undefined) {
      list = await queue.list(true);
    }
    const removedLevels = current_level === undefined ? [] : [current_level];
    let eligible_levels = list.online;
    if (eligible_levels.length == 0) {
      eligible_levels = list.offline;
      if (eligible_levels.length == 0) {
        current_level = undefined;
        queue.onRemove(removedLevels);
        queue.save();
        return current_level;
      }
    }

    const random_index = Math.floor(Math.random() * eligible_levels.length);
    current_level = eligible_levels[random_index];
    const index = levels.findIndex((level) => level === current_level);
    if (index == -1) {
      throw new Error("unreachable");
    }
    queue.removeWaiting();
    levels.splice(index, 1);
    queue.onRemove(removedLevels);
    queue.save();
    return current_level;
  },

  subrandom: async () => {
    const list = await queue.sublist(true);
    return await queue.random(list);
  },

  modrandom: async () => {
    const list = await queue.modlist(true);
    return await queue.random(list);
  },

  weightedrandom: async (list: OnlineOfflineList | undefined = undefined) => {
    const weightedList = await queue.weightedList(false, list, true);
    const removedLevels = current_level === undefined ? [] : [current_level];

    if (weightedList.entries.length == 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }

    const totalWeight = weightedList.totalWeight;
    const randomNumber = Math.floor(Math.random() * totalWeight) + 1;
    let levelIndex = 0;
    let gettingThereSomeday = weightedList.entries[0].weight();

    console.log(
      "Elegible users: " +
        weightedList.entries
          .map((entry) => entry.level.submitter.toString())
          .reduce((a, b) => a + ", " + b)
    );
    console.log(
      "Elegible users time: " +
        weightedList.entries.map((entry) => entry.weight())
    );

    console.log("Random number: " + randomNumber);
    console.log("Current cumulative time: " + gettingThereSomeday);
    while (gettingThereSomeday < randomNumber) {
      levelIndex++;
      gettingThereSomeday =
        gettingThereSomeday + weightedList.entries[levelIndex].weight();
      console.log("Current cumulative time: " + gettingThereSomeday);
    }

    console.log(
      "Chosen index was " +
        levelIndex +
        " after a cumulative time of " +
        gettingThereSomeday
    );
    current_level = weightedList.entries[levelIndex].level;

    const index = levels.findIndex((level) => level === current_level);
    if (index == -1) {
      throw new Error("unreachable");
    }
    levels.splice(index, 1);

    const selectionChance = queue.percent(
      weightedList.entries[levelIndex].weight(),
      totalWeight
    );

    queue.removeWaiting();
    queue.onRemove(removedLevels);
    queue.save();

    return { ...current_level, selectionChance };
  },

  /** @type {(sorted?: boolean, list?: OnlineOfflineList) => Promise<WeightedList>} */
  weightedList: async (
    sorted: boolean | undefined = undefined,
    list: OnlineOfflineList | undefined = undefined,
    forceRefresh = false
  ): Promise<WeightedList> => {
    if (list === undefined) {
      list = await queue.list(forceRefresh);
    }
    const online_users = list.online;
    if (online_users.length == 0 || Object.keys(waiting).length == 0) {
      return {
        totalWeight: 0,
        entries: [],
        offlineLength: list.offline.length + online_users.length,
      };
    }

    let entries = online_users
      .filter((level) =>
        Object.prototype.hasOwnProperty.call(waiting, level.submitter.login)
      )
      .map((level, position) => {
        return {
          weight: () => waiting[level.submitter.login].weight(),
          position: position,
          level: level,
        };
      });

    if (sorted === undefined || sorted) {
      entries = entries.sort(
        (a, b) => b.weight() - a.weight() || a.position - b.position
      );
    }

    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight(), 0);

    return {
      totalWeight: totalWeight,
      entries: entries,
      offlineLength:
        list.offline.length + (online_users.length - entries.length),
    };
  },

  percent: (weight: number, totalWeight: number) => {
    let percent = (weight / totalWeight) * 100.0;
    if (percent > 100.0) {
      percent = 100.0;
    } else if (isNaN(percent) || percent < 0.0) {
      percent = 0.0;
    }
    const percentString = percent.toFixed(1);
    if (percentString === "100.0" && weight != totalWeight) {
      return ">99.9";
    }
    if (percentString === "0.0" && weight != 0) {
      return "<0.1";
    }
    return percentString;
  },

  multiplier: (username: QueueSubmitter | string) => {
    if (settings.subscriberWeightMultiplier && twitch.isSubscriber(username)) {
      return settings.subscriberWeightMultiplier;
    }
    return 1.0;
  },

  weightednext: async (
    list: OnlineOfflineList | undefined = undefined
  ): Promise<(QueueEntry & { selectionChance: string }) | undefined> => {
    const weightedList = await queue.weightedList(true, list, true);
    const removedLevels = current_level === undefined ? [] : [current_level];

    if (weightedList.entries.length == 0) {
      current_level = undefined;
      queue.onRemove(removedLevels);
      queue.save();
      return current_level;
    }

    current_level = weightedList.entries[0].level;

    // index of the level can be different than 0
    const index = levels.findIndex((level) => level === current_level);
    if (index == -1) {
      throw new Error("unreachable");
    }
    levels.splice(index, 1);

    const selectionChance = queue.percent(
      weightedList.entries[0].weight(),
      weightedList.totalWeight
    );

    queue.removeWaiting();
    queue.onRemove(removedLevels);
    queue.save();

    return { ...current_level, selectionChance };
  },

  weightedsubrandom: async () => {
    const list = await queue.sublist(true);
    return await queue.weightedrandom(list);
  },

  weightedsubnext: async () => {
    const list = await queue.sublist(true);
    return await queue.weightednext(list);
  },

  /** @type {() => Promise<OnlineOfflineList> } */
  list: async (forceRefresh = false) => {
    let online: QueueEntry[] = [];
    let offline: QueueEntry[] = [];
    await twitch.getOnlineUsers(forceRefresh).then((onlineUsers) => {
      [online, offline] = partition(levels, (level) =>
        onlineUsers.hasSubmitter(level.submitter)
      );
    });
    return { online, offline };
  },

  sublist: async (forceRefresh = false) => {
    let online: QueueEntry[] = [];
    let offline: QueueEntry[] = [];
    await twitch.getOnlineSubscribers(forceRefresh).then((onlineUsers) => {
      [online, offline] = partition(levels, (level) =>
        onlineUsers.hasSubmitter(level.submitter)
      );
    });
    return { online, offline };
  },

  modlist: async (forceRefresh = false) => {
    let online: QueueEntry[] = [];
    let offline: QueueEntry[] = [];
    await twitch.getOnlineMods(forceRefresh).then((onlineUsers) => {
      [online, offline] = partition(levels, (level) =>
        onlineUsers.hasSubmitter(level.submitter)
      );
    });
    return { online, offline };
  },

  matchSubmitter: (submitter: QueueSubmitter) => {
    return (level: QueueEntry) => level.submitter.equals(submitter);
  },

  matchUsernameArgument: (usernameArgument: string) => {
    usernameArgument = usernameArgument.trim().replace(/^@/, "");
    return (level: QueueEntry) => {
      // display name (submitter) or user name (username) matches
      // `isSubmitter` has to be called twice here, since only `login` is checked if both `login` and `displayName` are set
      return (
        level.submitter.equals({ login: usernameArgument }) ||
        level.submitter.equals({ displayName: usernameArgument })
      );
    };
  },

  persistenceManagement: async (subCommand: string) => {
    if (subCommand == "on") {
      persist = true;
      return "Activated automatic queue persistence.";
    } else if (subCommand == "off") {
      persist = false;
      return "Deactivated automatic queue persistence.";
    } else if (subCommand == "save") {
      // force save
      const success = queue.save({ force: true });
      if (success) {
        return "Successfully persisted the queue state.";
      } else {
        return "Error while persisting queue state, see logs.";
      }
    } else if (
      subCommand == "load" ||
      subCommand == "reload" ||
      subCommand == "restore"
    ) {
      // load queue state
      queue.loadQueueState();
      return "Reloaded queue state from disk.";
    } else {
      return "Invalid arguments. The correct syntax is !persistence {on/off/save/load}.";
    }
  },

  save: (options: { force: boolean } = { force: false }) => {
    if (persist || options.force) {
      const serializedCurrentLevel: PersistedQueueEntry | null =
        current_level?.serialize() ?? null;
      return persistence.saveQueueSync({
        currentLevel: serializedCurrentLevel,
        queue: levels.map((level) => level.serialize()),
        waiting: Waiting.recordToJson(waiting),
        // TODO: add test case to check that only data and version are persisted
        extensions: extensions.persistedQueueBindings(),
      });
    } else {
      return false;
    }
  },

  // TODO: could be used instead of the sync variant
  //       mixing sync and async might not be a good idea
  //       as well as test cases not working correctly any more
  // saveAsync: async (options = {}) => {
  //   options = { force: false, ...options };
  //   if (persist || options.force) {
  //     return await persistence.saveQueue({
  //       currentLevel: current_level,
  //       queue: levels,
  //       waiting,
  //       extensions: extensions.getQueueBindings(),
  //     });
  //   } else {
  //     return false;
  //   }
  // },

  isPersisting: () => {
    return persist;
  },

  loadQueueState: () => {
    let save = false;

    // load queue state
    const state = persistence.loadQueueSync();

    // override queue bindings
    extensions.overrideQueueBindings(state.extensions);

    // upgrade levels that do not have their type set
    const allPersistedEntries = (
      state.currentLevel == null ? [] : [state.currentLevel]
    ).concat(state.queue);
    save = extensions.upgradeEntries(allPersistedEntries) || save;

    // deserialize all entries
    if (state.currentLevel == null) {
      current_level = undefined;
    } else {
      current_level = extensions.deserialize(state.currentLevel);
    }
    levels = state.queue.map((level) => extensions.deserialize(level));

    // split waiting map into lists
    waiting = Waiting.fromRecord(state.waiting);

    // extensions can now check their entries
    const allEntries = (
      current_level === undefined ? [] : [current_level]
    ).concat(levels);
    save = extensions.checkEntries(allEntries) || save;

    // set save handler -> from now on it is save to save!
    extensions.setQueueBindingSaveHandler(() => {
      queue.save();
    });

    if (save) {
      queue.save();
    }
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
      queue.loadQueueState();
      // do not setup the timer again or reload custom codes
      return;
    }

    // load extensions
    await extensions.load();

    // load queue state
    queue.loadQueueState();

    // Start the waiting time timer
    setIntervalAsync(queue.waitingTimerTick, 60000);

    loaded = true;
  },

  waitingTimerTick: async () => {
    const list = await queue.list();
    const now = new Date().toISOString();
    list.online
      .map((v) => v.submitter.login)
      .forEach((username) => {
        if (Object.prototype.hasOwnProperty.call(waiting, username)) {
          waiting[username].addOneMinute(queue.multiplier(username), now);
        } else {
          waiting[username] = Waiting.create(now);
        }
      });
    queue.save();
    // TODO: use this instead? (see comment of queue.saveAsync)
    // await queue.saveAsync();
  },

  clear: () => {
    current_level = undefined;
    const removedLevels = levels;
    levels = [];
    queue.onRemove(removedLevels);
    queue.save();
  },
};

export type Queue = typeof queue;

export function quesoqueue() {
  return queue;
}
