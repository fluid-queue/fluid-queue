// imports
import * as jestChance from "jest-chance";
import { Volume, createFsFromVolume } from "memfs";
import path from "path";
import fs from "fs";
import { ChatChatter } from "../src/twitch-api";
import {
  SetIntervalAsyncHandler,
  SetIntervalAsyncTimer,
} from "set-interval-async";
import { Settings } from "../src/settings";
import { Chatter, Responder } from "../src/extensions-api/command";
import { helper } from "../src/chatbot";
import { z } from "zod";
import { QueueSubmitter } from "../src/extensions-api/queue-entry";
import { Queue } from "../src/queue";
import { Twitch } from "../src/twitch";

// constants
const START_TIME = new Date("2022-04-21T00:00:00Z"); // every test will start with this time
const DEFAULT_TEST_SETTINGS = {
  channel: "queso_queue_test_channel",
  clientId: "",
  clientSecret: "",
  max_size: 50,
  level_timeout: 10,
  level_selection: [
    "next",
    "subnext",
    "modnext",
    "random",
    "subrandom",
    "modrandom",
  ],
  message_cooldown: 5,
};
/**
 * @deprecated
 */
type LegacyChatChatters = {
  _links: unknown;
  chatter_count: number;
  chatters: Record<string, string[]>;
};
// constants
const EMPTY_CHATTERS = {
  _links: {},
  chatter_count: 0,
  chatters: {
    broadcaster: [],
    vips: [],
    moderators: [],
    staff: [],
    admins: [],
    global_mods: [],
    viewers: [],
  },
};
// async function type
const AsyncFunction = (async () => {
  /* used for type information */
}).constructor;

// mock variables
let mockChatters: ChatChatter[] = [];

let clearAllTimersIntern: (() => Promise<void>) | null = null;

const mockModules = () => {
  // mocks
  jest.mock("../src/twitch-api");
  jest.mock("../src/chatbot");
  jest.mock("node-fetch", () => jest.fn());

  jest.mock("set-interval-async/dynamic", () => {
    // using fixed timers instead of dynamic timers
    // TODO: why do these work with tests? why are dynamic timers not working?
    const timers = jest.requireActual("set-interval-async/fixed");
    const asyncTimers: SetIntervalAsyncTimer<unknown[]>[] = [];
    const result = {
      setIntervalAsync<HandlerArgs extends unknown[]>(
        handler: SetIntervalAsyncHandler<HandlerArgs>,
        intervalMs: number,
        ...handlerArgs: HandlerArgs
      ): SetIntervalAsyncTimer<HandlerArgs> {
        const timer = timers.setIntervalAsync(
          handler,
          intervalMs,
          ...handlerArgs
        );
        asyncTimers.push(timer);
        return timer;
      },
      async clearIntervalAsync<HandlerArgs extends unknown[]>(
        timer: SetIntervalAsyncTimer<HandlerArgs>
      ): Promise<void> {
        const index = asyncTimers.findIndex((t) => t === timer);
        if (index != -1) {
          asyncTimers.splice(index, 1);
          await timers.clearIntervalAsync(timer);
        }
      },
      clearAllTimers: async () => {
        while (asyncTimers.length) {
          const t = asyncTimers.pop();
          await timers.clearIntervalAsync(t);
        }
      },
    };
    clearAllTimersIntern = result.clearAllTimers.bind(result);
    return result;
  });

  // only import after mocking!
  const { twitchApi } = require("../src/twitch-api");

  // mock chatters
  twitchApi.getChatters.mockImplementation(() => Promise.resolve(mockChatters));
};

const simSetChatters = (
  newChatters: LegacyChatChatters | LegacyChatChatters["chatters"]
) => {
  let chatters: LegacyChatChatters["chatters"];
  // automatically create a correct chatters object
  if (!("chatters" in newChatters) || Array.isArray(newChatters["chatters"])) {
    chatters = newChatters as LegacyChatChatters["chatters"];
  } else {
    chatters = newChatters["chatters"];
  }
  const users: ChatChatter[] = [];
  Object.keys(chatters).forEach((y) =>
    // FIXME: add user id
    chatters[y].forEach((z) =>
      users.push({
        userId: `test/username/${z}`,
        userName: z,
        userDisplayName: z,
      })
    )
  );
  mockChatters = users;
  return mockChatters;
};

/**
 * This is neccessary, such that .js files can be found in folders
 *
 * @param {*} volume
 * @param {*} srcPath
 */
const populateMockVolume = (
  volume: InstanceType<typeof Volume>,
  srcPath: string
) => {
  const result: Record<string, string> = {};
  const files = fs.readdirSync(path.resolve(__dirname, "..", srcPath));
  for (const file of files) {
    const srcFile = path.join(srcPath, file);
    if (
      fs.lstatSync(path.resolve(__dirname, "..", srcPath, file)).isDirectory()
    ) {
      populateMockVolume(volume, srcFile);
    } else {
      // files are just empty files in the mock volume
      result[srcFile] = "";
    }
  }
  volume.fromJSON(result, path.resolve("."));
};

const createMockVolume = (
  settings?: z.input<typeof Settings>
): InstanceType<typeof Volume> => {
  const volume = new Volume();
  volume.mkdirSync(path.resolve("."), { recursive: true });
  populateMockVolume(volume, "./src");
  if (settings !== undefined) {
    console.log("./settings/settings.json: " + JSON.stringify(settings));
    volume.fromJSON(
      { "./settings/settings.json": JSON.stringify(settings) },
      path.resolve(".")
    );
  }
  return volume;
};

type Index = {
  fs: typeof fs;
  volume: InstanceType<typeof Volume>;
  settings: z.output<typeof Settings>;
  chatbot: { helper: typeof helper };
  chatbot_helper: ReturnType<typeof helper>;
  random: jest.SpyInstance<number, []>;
  quesoqueue: Queue;
  handle_func: (message: string, sender: Chatter, respond: Responder) => void;
  twitch: Twitch;
};

function asMock<R, A extends unknown[]>(
  fn: (...args: A) => R
): jest.Mock<R, A> {
  return <jest.Mock<R>>fn;
}

/**
 * load `index.js` and test it being setup correctly
 */
const simRequireIndex = async (
  volume?: InstanceType<typeof Volume>,
  mockSettings?: z.input<typeof Settings>,
  mockTime?: number | Date,
  setupMocks?: () => Promise<void> | void
): Promise<Index> => {
  let fs: Index["fs"] | undefined;
  let settings: z.output<typeof Settings> | undefined;
  let chatbot: { helper: typeof helper } | undefined;
  let chatbot_helper: ReturnType<typeof helper> | undefined;
  let random: jest.SpyInstance<number, []> | undefined;
  let quesoqueue: Queue | undefined;
  let handle_func:
    | ((message: string, sender: Chatter, respond: Responder) => void)
    | undefined;
  let twitch: Twitch | undefined;

  try {
    let main: () => Promise<void> = async () => {
      // NO-OP
    };
    await clearAllTimers();
    jest.resetModules();
    await mockModules();
    if (setupMocks !== undefined) {
      await setupMocks();
    }
    jest.useFakeTimers();
    await jest.isolateModulesAsync(async () => {
      // mockModules();
      // remove timers
      jest.clearAllTimers();

      // setup time
      jest.useFakeTimers();

      if (mockTime !== undefined) {
        jest.setSystemTime(mockTime);
      } else {
        jest.setSystemTime(START_TIME);
      }

      // setup random mock
      const chance = jestChance.getChance();
      random = jest.spyOn(global.Math, "random").mockImplementation(() => {
        return chance.random();
      });

      // prepare settings
      if (mockSettings === undefined) {
        mockSettings = DEFAULT_TEST_SETTINGS;
      }

      // create virtual file system
      if (volume === undefined) {
        volume = createMockVolume(mockSettings);
      } else {
        // copy files
        const files = volume.toJSON();
        volume = new Volume();
        volume.fromJSON(files);
        volume.fromJSON(
          { "./settings/settings.json": JSON.stringify(mockSettings) },
          path.resolve(".")
        );
      }

      // setup virtual file system
      const mockFs = createFsFromVolume(volume);
      jest.mock("fs", () => mockFs);
      fs = require("fs");

      // import settings
      settings = require("../src/settings").default;

      // import libraries
      chatbot = require("../src/chatbot");
      twitch = require("../src/twitch").twitch;
      // const queue = require("../src/queue");

      // run index.js
      const idx = require("../src/index");
      main = idx.main;
      quesoqueue = idx.quesoqueue;
    });
    await main();
    if (chatbot === undefined) {
      throw new Error("chatbot was not loaded correctly");
    }

    // get hold of chatbot_helper
    expect(asMock(chatbot.helper)).toHaveBeenCalledTimes(1);
    chatbot_helper = asMock(chatbot.helper).mock.results[0].value;

    if (chatbot_helper === undefined) {
      throw new Error("chatbot_helper was not setup correctly");
    }

    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.say).toHaveBeenCalledTimes(0);

    // get hold of the handle function
    // the first argument of setup has to be an AsyncFunction
    expect(asMock(chatbot_helper.setup).mock.calls[0][0]).toBeInstanceOf(
      AsyncFunction
    );
    handle_func = asMock(chatbot_helper.setup).mock.calls[0][0];
  } catch (err) {
    console.warn(err);
    if (err != null && typeof err === "object") {
      (err as Record<string, unknown>).simIndex = {
        fs,
        volume,
        settings,
        chatbot,
        chatbot_helper,
        random,
        quesoqueue,
        handle_func,
        twitch,
      };
    }
    throw err;
  }

  if (fs === undefined) {
    throw new Error("fs was not loaded correctly");
  }
  if (volume === undefined) {
    throw new Error("volume was not setup correctly");
  }
  if (settings === undefined) {
    throw new Error("settings were not loaded correctly");
  }
  if (random === undefined) {
    throw new Error("random was not setup correctly");
  }
  if (quesoqueue === undefined) {
    throw new Error("queue was not loaded correctly");
  }
  if (twitch === undefined) {
    throw new Error("twitch was not loaded correctly");
  }

  return {
    fs,
    volume,
    settings,
    chatbot,
    chatbot_helper,
    random,
    quesoqueue,
    handle_func,
    twitch,
  };
};

const flushPromises = async () => {
  await new Promise(jest.requireActual("timers").setImmediate);
};

const clearAllTimers = async () => {
  const time = new Date();
  jest.clearAllTimers();
  if (clearAllTimersIntern != null) {
    await clearAllTimersIntern;
  }
  jest.setSystemTime(time);
};

/**
 * Advances time and runs timers.
 * Waits for async timers to run.
 *
 * @param {number} ms How many milliseconds to advance time
 * @param {number} accuracy How accurate timers are being simulated, in milliseconds
 */
const simAdvanceTime = async (ms: number, accuracy = 0) => {
  const currentTime = new Date();
  await flushPromises();

  // advance by accuracy intervals
  if (accuracy > 0) {
    for (let i = 0; i < ms; i += accuracy) {
      const advance = Math.min(accuracy, ms - i);
      jest.advanceTimersByTime(advance);
      await flushPromises();
    }
  } else {
    jest.advanceTimersByTime(ms);
    await flushPromises();
  }
  expect(new Date().getTime() - currentTime.getTime()).toEqual(ms);
};

/**
 * Sets the time to the given time and adds a day in case time would have gone backwards.
 * Also runs timers and waits for async timers to run.
 *
 * @param {string|Date} time Time in the format `HH:mm:ss` in UTC or a Date.
 * @param {number} accuracy How accurate timers are being simulated, in milliseconds
 */
const simSetTime = async (time: string | Date, accuracy = 0) => {
  const prevTime = new Date();
  let newTime;
  if (time instanceof Date) {
    newTime = time;
  } else {
    newTime = new Date();
    const timeArray = time.split(":").map((x) => parseInt(x, 10));
    newTime.setUTCHours(timeArray[0]);
    newTime.setUTCMinutes(timeArray[1]);
    newTime.setUTCSeconds(timeArray[2]);
    if (newTime < prevTime) {
      // add one day in case of time going backwards
      newTime.setUTCDate(newTime.getUTCDate() + 1);
    }
  }
  const diff = newTime.getTime() - prevTime.getTime();
  if (diff > 0) {
    await simAdvanceTime(diff, accuracy);
  } else if (diff < 0) {
    // should not happen
    throw Error(
      `Time went backwards, from ${prevTime} to ${newTime} (${time})`
    );
  }
};

const buildChatter = (
  username: string,
  displayName: string,
  isSubscriber: boolean,
  isMod: boolean,
  isBroadcaster: boolean
): Chatter => {
  return {
    // FIXME: user id
    id: `test/username/${username}`,
    login: username,
    displayName,
    isSubscriber,
    isMod,
    isBroadcaster,
    toString() {
      return this.displayName;
    },
    equals(other: Partial<QueueSubmitter>) {
      if (other.id !== undefined && this.id !== undefined) {
        return other.id == this.id;
      }
      if (other.login !== undefined) {
        return other.login == this.login;
      }
      if (other.displayName !== undefined) {
        return other.displayName == this.displayName;
      }
      return false;
    },
  };
};

const replace = (
  settings: z.output<typeof Settings>,
  newSettings: z.output<typeof Settings>
) => {
  Object.keys(settings).forEach((key) => {
    delete (settings as Record<string, unknown>)[key];
  });
  Object.assign(settings, newSettings);
};

export {
  asMock,
  simRequireIndex,
  simAdvanceTime,
  simSetTime,
  simSetChatters,
  buildChatter,
  createMockVolume,
  replace,
  flushPromises,
  clearAllTimers,
  START_TIME,
  DEFAULT_TEST_SETTINGS,
  EMPTY_CHATTERS,
};