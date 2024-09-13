// imports
import { MethodLikeKeys } from "jest-mock";
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
import { codeFrameColumns, SourceLocation } from "@babel/code-frame";
import { ParjsParsingFailure } from "parjs";

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

const mockModules = async (chanceSeed?: Chance.Seed) => {
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

  const module = await import("uuid");
  const chance = jestChance.getChance(chanceSeed);
  const mt = chance.mersenne_twister(chanceSeed ?? chance.seed) as {
    random: () => number;
  };

  jest.unstable_mockModule("uuid", () => {
    // using seeded random values in tests
    const v4 = jest.fn((options?: Parameters<typeof module.v4>[0]) => {
      return module.v4(
        options ?? {
          rng: () => {
            return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
              () => Math.floor(mt.random() * 256)
            );
          },
        }
      );
    });
    return {
      __esModule: true, // Use it when dealing with esModules
      ...module,
      v4,
    };
  });
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
  uuidv4: jest.Mock<() => string>;
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
      registerStreamCallbacks = jest.fn(() => {
        // These can be tested without being registered
        return;
      });
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
  setupMocks?: () => Promise<void> | void,
  chanceSeed?: Chance.Seed
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
  let uuidv4: jest.Mock<() => string> | undefined;

  try {
    await clearAllTimers();
    jest.clearAllTimers();
    jest.runAllTicks();
    jest.resetModules();
    await mockModules(chanceSeed);
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
    const chance = jestChance.getChance(chanceSeed);
    const mt = chance.mersenne_twister(chanceSeed ?? chance.seed) as {
      random: () => number;
    };
    random = jest.spyOn(global.Math, "random").mockImplementation(() => {
      return mt.random();
    });

    const uuid = await import("uuid");
    uuidv4 = asMock(uuid, "v4");

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
      console.log("./settings/settings.yml: " + YAML.stringify(settings));
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
        uuidv4,
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
  if (uuidv4 === undefined) {
    throw new Error("uuidv4 was not loaded correctly");
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
    uuidv4,
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

type SimulationMeta = {
  fileName?: string | undefined;
  fileContents?: string | undefined;
  lineNo?: number | undefined;
  sourceLocation?: SourceLocation | undefined;
  position?:
    | {
        start: number;
        end: number;
      }
    | undefined;
  response?:
    | { message: string; error: Error }
    | (() => { message: string; error: Error } | undefined)
    | undefined;
};

class Simulation {
  #index: Index;
  #settingsInput: z.input<typeof Settings> | undefined = undefined;
  #responses: Array<{ message: string; error: Error }> = [];
  #accuracy: number = 0;
  #meta: SimulationMeta[] = [];
  #errors: Set<Error> = new Set();

  public constructor(index: Index) {
    this.#index = index;
    this.updateChatBinding();
  }

  private updateChatBinding() {
    const responses = this.#responses;
    function pushMessage(message: string) {
      const error = new Error("<Stack Trace Capture>");
      Error.captureStackTrace(error, pushMessage);
      responses.push({ message, error });
    }
    asMock(this.#index.chatbot_helper, "say").mockImplementation(pushMessage);
  }

  public static async load(): Promise<Simulation> {
    const index = await simRequireIndex();
    return new Simulation(index);
  }

  public async restart() {
    const time = new Date();
    await clearAllTimers();
    await clearAllTimers();
    this.#index = await simRequireIndex(
      this.#index.volume,
      this.#settingsInput,
      time
    );
    this.updateChatBinding();
  }

  public set accuracy(value: number) {
    this.#accuracy = value;
  }

  public get accuracy() {
    return this.#accuracy;
  }

  public isSettings(data: unknown): data is z.input<typeof Settings> {
    return Settings.safeParse(data).success;
  }

  public set settings(data: z.input<typeof Settings> | undefined) {
    // TODO: ideally new settings would be written to settings.yml
    //       and settings.js could be reloaded instead to validate settings
    replace(
      this.#index.settings,
      Settings.parse(data ?? DEFAULT_TEST_SETTINGS)
    );
    this.#settingsInput = data;
    if (this.#settingsInput === undefined) {
      console.log("reset settings to test defaults");
    } else {
      console.log("set settings to: " + YAML.stringify(this.#settingsInput));
    }
  }

  public get settings(): z.input<typeof Settings> | undefined {
    return this.#settingsInput;
  }

  public set chatters(value: User[]) {
    // TODO: do not use global state
    simSetChatters(value);
  }

  public get chatters(): User[] {
    return mockChatters;
  }

  public readQueueData(): unknown {
    return JSON.parse(
      this.#index.fs.readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../data/queue.json"
        ),
        "utf-8"
      )
    );
  }

  public writeQueueData(data: unknown) {
    this.#index.fs.writeFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../data/queue.json"
      ),
      JSON.stringify(data)
    );
  }

  public readExtensionData(extensionName: string): unknown {
    return JSON.parse(
      this.#index.fs.readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          `../data/extensions/${extensionName}.json`
        ),
        "utf-8"
      )
    );
  }

  public writeExtensionData(extensionName: string, data: unknown) {
    this.#index.fs.writeFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        `../data/extensions/${extensionName}.json`
      ),
      JSON.stringify(data)
    );
  }

  public async setTime(time: string | Date, runTimers = true) {
    await simSetTime(time, runTimers ? this.#accuracy : 0);
  }

  public nextRandom(value: number) {
    this.#index.random.mockImplementationOnce(() => value);
  }

  public nextUuid(value: string) {
    this.#index.uuidv4.mockImplementationOnce(() => value);
  }

  public isFsFunction(name: string): name is MethodLikeKeys<Index["fs"]> {
    return (
      name in this.#index.fs &&
      typeof (this.#index.fs as Record<string, unknown>)[name] === "function"
    );
  }

  public nextFsFail(name: MethodLikeKeys<Index["fs"]>) {
    jest
      .spyOn(jest.requireMock<typeof fs>("fs"), name)
      .mockImplementationOnce(() => {
        throw new Error("fail on purpose in test");
      });
    jest.spyOn(this.#index.fs, name).mockImplementationOnce(() => {
      throw new Error("fail on purpose in test");
    });
  }

  public async sendMessage(message: string, sender: Chatter) {
    await this.#index.handle_func(
      message,
      sender,
      this.#index.chatbot_helper.say
    );
  }

  public get responses() {
    return this.#responses;
  }

  public set responses(value: Array<{ message: string; error: Error }>) {
    this.#responses = value;
  }

  private get currentMeta(): SimulationMeta {
    if (this.#meta.length == 0) {
      return {};
    }
    return this.#meta[this.#meta.length - 1];
  }

  private toSourceLocation(
    fileContents: string,
    { start, end }: { start: number; end: number }
  ): SourceLocation {
    const prev = fileContents.substring(0, start);
    const lines = fileContents.substring(start, end).split("\n");
    let lineIndex = prev.lastIndexOf("\n");
    if (lineIndex == -1) {
      lineIndex = 0;
    } else {
      lineIndex++;
    }
    const lineNo = prev.split("\n").length;
    const contentLines = lines.length - 1;
    return {
      start: {
        line: lineNo,
        column: start - lineIndex + 1,
      },
      end: {
        line: lineNo + contentLines,
        column:
          (contentLines != 0 ? 0 : start - lineIndex + 1) +
          lines[lines.length - 1].length,
      },
    };
  }

  public async test<R>(test: () => PromiseLike<R> | R): Promise<R> {
    try {
      return await test();
    } catch (error) {
      if (error instanceof Error && !this.#errors.has(error)) {
        this.#errors.add(error);
        let message = "";
        let frame: [string, SourceLocation] | undefined;
        if (this.currentMeta.fileContents !== undefined) {
          if (this.currentMeta.position !== undefined) {
            frame = [
              this.currentMeta.fileContents,
              this.toSourceLocation(
                this.currentMeta.fileContents,
                this.currentMeta.position
              ),
            ];
          } else if (this.currentMeta.sourceLocation !== undefined) {
            frame = [
              this.currentMeta.fileContents,
              this.currentMeta.sourceLocation,
            ];
          } else if (error instanceof ParjsParsingFailure) {
            frame = [
              this.currentMeta.fileContents,
              {
                start: {
                  line: error.failure.trace.location.line + 1,
                  column: error.failure.trace.location.column + 1,
                },
              },
            ];
          }
        }
        if (this.currentMeta.fileName !== undefined) {
          message += "\n" + `in test file ${this.currentMeta.fileName}`;
          if (frame !== undefined) {
            message += `:${frame[1].start.line}`;
          } else if (this.currentMeta.lineNo !== undefined) {
            message += `:${this.currentMeta.lineNo}`;
          }
        }
        if (frame !== undefined) {
          message += "\n" + codeFrameColumns(...frame);
        }
        if (message !== "") {
          message = "\n" + message;
        }
        let response = this.currentMeta.response;
        if (typeof response === "function") {
          response = response();
        }
        if (response !== undefined) {
          error.stack = response.error.stack?.replace(
            response.error.message,
            error.message + message
          );
        } else {
          error.stack = error.stack?.replace(
            error.message,
            error.message + message
          );
        }
      }
      throw error;
    }
  }

  public async withMeta<R>(
    meta: Partial<SimulationMeta>,
    f: (simulation: Simulation) => PromiseLike<R> | R
  ): Promise<R> {
    this.#meta.push({ ...this.currentMeta, ...meta });
    const result = await this.test(async () => f(this));
    this.#meta.pop();
    return result;
  }
}

export {
  Simulation,
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
  START_TIME,
  DEFAULT_TEST_SETTINGS,
  EMPTY_CHATTERS,
  populateMockVolume,
};
