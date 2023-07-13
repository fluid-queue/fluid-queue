// imports
import { jest } from "@jest/globals";
import * as jestChance from "jest-chance";
import { FunctionLike } from "jest-mock";
import { Volume, createFsFromVolume } from "memfs";
import path from "path";
import fs from "fs";
import * as twitchApiModule from "fluid-queue/twitch-api.js";
import {
  SetIntervalAsyncHandler,
  SetIntervalAsyncTimer,
} from "set-interval-async";
import { Settings } from "fluid-queue/settings-type.js";
import { Chatter, Responder } from "fluid-queue/extensions-api/command.js";
import { Chatbot, helper } from "fluid-queue/chatbot.js";
import { z } from "zod";
import {
  QueueSubmitter,
  User,
} from "fluid-queue/extensions-api/queue-entry.js";
import { Queue } from "fluid-queue/queue.js";
import { Twitch } from "fluid-queue/twitch.js";
import * as timers from "timers";
import { fileURLToPath } from "url";
import YAML from "yaml";

// constants
const START_TIME = new Date("2022-04-21T00:00:00Z"); // every test will start with this time
const DEFAULT_TEST_SETTINGS = {
  channel: "queso_queue_test_channel",
  clientId: "",
  clientSecret: "",
  max_size: 50,
  level_timeout: "10 minutes",
  level_selection: [
    "next",
    "subnext",
    "modnext",
    "random",
    "subrandom",
    "modrandom",
  ],
  message_cooldown: "5 seconds",
};
// constants
const EMPTY_CHATTERS: User[] = [];
// async function type
const AsyncFunction = (async () => {
  /* used for type information */
}).constructor;

// mock variables
let mockChatters: User[] = [];
let mockSubscribers: User[] = [];
let mockModerators: User[] = [];

let clearAllTimersIntern: (() => Promise<void>) | null = null;

const mockModules = async () => {
  // mocks
  const twitchApi = (await mockTwitchApi()).twitchApi;
  jest.unstable_mockModule("fluid-queue/chatbot.js", () => {
    const chatbot_helper = jest.fn((): Chatbot => {
      return {
        client: null, // do not mock client, since it is not used outside
        handle_func: null, // not used outside either
        connect: jest.fn<Chatbot["connect"]>(),
        setup: jest.fn<Chatbot["setup"]>(() => undefined),
        say: jest.fn<Chatbot["say"]>(() => undefined),
      };
    });
    return {
      helper: chatbot_helper,
    };
  });
  jest.mock("node-fetch", () => jest.fn());

  jest.unstable_mockModule("set-interval-async/dynamic", async () => {
    // using fixed timers instead of dynamic timers
    // TODO: why do these work with tests? why are dynamic timers not working?
    const timers = await import("set-interval-async/fixed");
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
          if (t !== undefined) {
            await timers.clearIntervalAsync(t);
          }
        }
      },
    };
    clearAllTimersIntern = result.clearAllTimers.bind(result);
    return {
      __esModule: true, // Use it when dealing with esModules
      ...timers,
      ...result,
    };
  });

  await import("set-interval-async/dynamic");

  // mock chatters
  asMock(twitchApi, "getChatters").mockImplementation(() =>
    Promise.resolve(mockChatters)
  );

  // mock needed for ttlcache
  jest.spyOn(global.performance, "now").mockImplementation(() => {
    let result;
    if (typeof global.performance.timeOrigin === "number") {
      const origin = Math.floor(global.performance.timeOrigin);
      result = Math.max(new Date().getTime() - origin, 0);
    } else {
      result = new Date().getTime();
    }
    return result;
  });
};

const expectErrorMessage = (promise: Promise<unknown>) => {
  return expect(
    promise.then(
      (value) => value,
      (reason) => {
        console.log(reason);
        if (typeof reason !== "object") {
          return Promise.reject(reason);
        }
        const reasonObject = reason as object;
        if (reasonObject.constructor === Error.prototype.constructor) {
          expect(reasonObject.constructor).toBe(Error);
        } else {
          expect(Object.getPrototypeOf(reasonObject.constructor)).toBe(Error);
        }
        return Promise.reject(
          "message" in reasonObject ? reasonObject.message : reasonObject
        );
      }
    )
  ).rejects;
};

const simSetChatters = (newChatters: User[]) => {
  mockChatters = newChatters;
};

const simSetSubscribers = (newSubscribers: User[]) => {
  mockSubscribers = newSubscribers;
};

const simSetModerators = (newMods: User[]) => {
  mockModerators = newMods;
};

/**
 * This is neccessary, such that .js files can be found in folders.
 * This is also necessary to load localization data so the correct output is observed.
 *
 * @param {*} volume
 * @param {*} srcPath
 * @param {boolean} emptyFiles
 */
const populateMockVolume = (
  volume: InstanceType<typeof Volume>,
  srcPath: string,
  emptyFiles = true
) => {
  const result: Record<string, string> = {};
  const files = fs.readdirSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", srcPath)
  );
  for (const file of files) {
    const srcFile = path.join(srcPath, file);
    if (
      fs
        .lstatSync(
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "..",
            srcPath,
            file
          )
        )
        .isDirectory()
    ) {
      populateMockVolume(volume, srcFile, emptyFiles);
    } else {
      if (emptyFiles) {
        // files are just empty files in the mock volume
        result[srcFile] = "";
      } else {
        result[srcFile] = fs.readFileSync(srcFile).toString();
      }
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
  populateMockVolume(volume, "./locales", false);
  if (settings !== undefined) {
    console.log("./settings/settings.yml: " + YAML.stringify(settings));
    volume.fromJSON(
      { "./settings/settings.yml": YAML.stringify(settings) },
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
  random: jest.Spied<() => number>;
  quesoqueue: Queue;
  handle_func: (
    message: string,
    sender: Chatter,
    respond: Responder
  ) => Promise<void>;
  twitch: Twitch;
};

function asMock<T, K extends keyof T>(
  obj: T,
  key: K
): T[K] extends FunctionLike ? jest.Mock<T[K]> : never {
  const result = obj[key];
  if (typeof result !== "function") {
    throw new Error(`Not a function!`);
  }
  return <T[K] extends FunctionLike ? jest.Mock<T[K]> : never>result;
}

export async function mockTwitchApi(): Promise<typeof twitchApiModule> {
  jest.unstable_mockModule("fluid-queue/twitch-api.js", () => {
    class TwitchApi {
      async setup() {
        // do nothing
      }
      createTmiClient() {
        throw new Error(
          "This should never be called from tests -> Use the chatbot.js mock instead!"
        );
      }
      getChatters = jest.fn((): Promise<User[]> => {
        return Promise.resolve([]);
      });

      getUsers = jest.fn((users: string[]): Promise<User[]> => {
        return Promise.resolve(
          users
            .filter((user) => {
              return !user.match(/^\${(deleted|renamed)\(.*\)(\.name)?}$/);
            })
            .map((user) => ({
              id: `\${user(${JSON.stringify(user)}).id}`,
              name: user,
              displayName: `\${user(${JSON.stringify(user)}).displayName}`,
            }))
        );
      });

      getUsersById = jest.fn((ids: string[]): Promise<User[]> => {
        return Promise.resolve(
          ids
            .filter((ids) => {
              return !ids.match(/^\${(deleted|renamed)\(.*\)(\.id)?}$/);
            })
            .map((user) => {
              const name = /^\${user\((.*)\)(\.id)?}$/.exec(user)?.[1];
              if (name == null) {
                throw new Error("User id has invalid format for tests!");
              }
              return {
                id: user,
                name: `\${user(${name}).name}`,
                displayName: `\${user(${name}).displayName}`,
              };
            })
        );
      });

      getSubscribers = jest.fn(
        async (): Promise<
          {
            id: string;
            name: string;
            displayName: string;
          }[]
        > => {
          // Return all the mock subscribers that have been added
          return Promise.resolve(
            mockSubscribers.map((chatter) => {
              return chatter;
            })
          );
        }
      );

      getModerators = jest.fn(
        async (): Promise<
          {
            id: string;
            name: string;
            displayName: string;
          }[]
        > => {
          // Return all the mock subscribers that have been added
          return Promise.resolve(
            mockModerators.map((chatter) => {
              return chatter;
            })
          );
        }
      );

      isStreamOnline = jest.fn(() => Promise.resolve(true));
      botTokenScopes = ["chat:read", "chat:edit", "moderator:read:chatters"];
      broadcasterTokenScopes = [
        "channel:read:subscriptions",
        "moderation:read",
      ];
      esListener = {
        start: () => {
          // pass
        },
        onChannelSubscription: () => {
          // pass
        },
      };
    }
    return {
      TwitchApi,
      twitchApi: new TwitchApi(),
    };
  });
  return await import("fluid-queue/twitch-api.js");
  //return jest.requireMock<typeof twitchApiModule>("fluid-queue/twitch-api.js");
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
  let random: jest.Spied<() => number> | undefined;
  let quesoqueue: Queue | undefined;
  let handle_func:
    | ((message: string, sender: Chatter, respond: Responder) => Promise<void>)
    | undefined;
  let twitch: Twitch | undefined;

  try {
    await clearAllTimers();
    jest.resetModules();
    await mockModules();
    if (setupMocks !== undefined) {
      await setupMocks();
    }
    jest.useFakeTimers();
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
    const mt = chance.mersenne_twister(chance.seed) as { random: () => number };
    random = jest.spyOn(global.Math, "random").mockImplementation(() => {
      return mt.random();
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
        { "./settings/settings.yml": YAML.stringify(mockSettings) },
        path.resolve(".")
      );
      populateMockVolume(volume, "./locales", false);
    }

    // setup virtual file system
    const mockFs = createFsFromVolume(volume);
    jest.mock("fs", () => ({
      __esModule: true, // Use it when dealing with esModules
      ...mockFs,
      default: mockFs,
      toString() {
        return "fs mock";
      },
    }));
    jest.unstable_mockModule("fs", () => ({
      ...mockFs,
      default: mockFs,
      toString() {
        return "fs module mock";
      },
    }));
    fs = (await import("fs")).default;

    // import settings
    settings = (await import("fluid-queue/settings.js")).default;

    // import libraries
    chatbot = await import("fluid-queue/chatbot.js");
    twitch = (await import("fluid-queue/twitch.js")).twitch;
    const queue = await import("fluid-queue/queue.js");
    quesoqueue = queue.quesoqueue();

    // run index.js
    await import("fluid-queue/index.js");
    if (chatbot === undefined) {
      throw new Error("chatbot was not loaded correctly");
    }

    // get hold of chatbot_helper
    expect(asMock(chatbot, "helper")).toHaveBeenCalledTimes(1);
    const result = asMock(chatbot, "helper").mock.results[0];
    if (result.type === "return") {
      chatbot_helper = result.value;
    }

    if (chatbot_helper === undefined) {
      throw new Error("chatbot_helper was not setup correctly");
    }

    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.say).toHaveBeenCalledTimes(0);

    // get hold of the handle function
    // the first argument of setup has to be an AsyncFunction
    expect(asMock(chatbot_helper, "setup").mock.calls[0][0]).toBeInstanceOf(
      AsyncFunction
    );
    handle_func = asMock(chatbot_helper, "setup").mock.calls[0][0];
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
  await new Promise(jest.requireActual<typeof timers>("timers").setImmediate);
};

const clearAllTimers = async () => {
  const time = new Date();
  jest.clearAllTimers();
  if (clearAllTimersIntern != null) {
    await clearAllTimersIntern();
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
      `Time went backwards, from ${prevTime.toISOString()} to ${newTime.toISOString()} (${
        typeof time === "string" ? time : time.toISOString()
      })`
    );
  }
};

const buildChatter = (
  username: string,
  displayName: string,
  isSubscriber: boolean,
  isMod: boolean,
  isBroadcaster: boolean,
  id?: string
): Chatter => {
  return {
    id: id ?? `\${user(${JSON.stringify(username)}).id}`,
    name: username,
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
      if (other.name !== undefined) {
        return other.name == this.name;
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
  simSetSubscribers,
  simSetModerators,
  buildChatter,
  createMockVolume,
  replace,
  flushPromises,
  clearAllTimers,
  expectErrorMessage,
  START_TIME,
  DEFAULT_TEST_SETTINGS,
  EMPTY_CHATTERS,
  populateMockVolume,
};
