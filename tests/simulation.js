"use strict";

// imports
const jestChance = require("jest-chance");
const { Volume, createFsFromVolume } = require("memfs");
const path = require("path");
const fs = require("fs");

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
var mockChatters = [];

var clearAllTimersIntern = null;

const mockModules = () => {
  // mocks
  jest.mock("../src/twitch-api.js");
  jest.mock("../src/chatbot.js");
  jest.mock("node-fetch", () => jest.fn());

  jest.mock("set-interval-async/dynamic", () => {
    // using fixed timers instead of dynamic timers
    // TODO: why do these work with tests? why are dynamic timers not working?
    const timers = jest.requireActual("set-interval-async/fixed");
    const result = {
      setIntervalAsync: (handler, interval, ...args) => {
        if (this.asyncTimers === undefined) {
          this.asyncTimers = [];
        }
        const timer = timers.setIntervalAsync(handler, interval, ...args);
        this.asyncTimers.push(timer);
        return timer;
      },
      clearIntervalAsync: async (timer) => {
        if (this.asyncTimers === undefined) {
          this.asyncTimers = [];
        }
        const index = this.asyncTimers.findIndex((t) => t === timer);
        if (index != -1) {
          this.asyncTimers.splice(index, 1);
          await timers.clearIntervalAsync(timer);
        }
      },
      clearAllTimers: async () => {
        if (this.asyncTimers === undefined) {
          this.asyncTimers = [];
        }
        while (this.asyncTimers.length) {
          const t = this.asyncTimers.pop();
          await timers.clearIntervalAsync(t);
        }
      },
    };
    clearAllTimersIntern = result.clearAllTimers.bind(result);
    return result;
  });

  // only import after mocking!
  const { twitchApi } = require("../src/twitch-api.js");

  // mock chatters
  twitchApi.getChatters.mockImplementation(() => Promise.resolve(mockChatters));
};

/**
 * @param {Object} newChatters chatters as returned by the chatters resource, see `../src/twitch.js`
 */
const simSetChatters = (newChatters) => {
  // automatically create a correct chatters object
  if (!Object.hasOwnProperty.call(newChatters, "chatters")) {
    newChatters = {
      _links: {},
      chatter_count: Object.values(newChatters).flat().length,
      chatters: newChatters,
    };
  }
  [
    "broadcaster",
    "vips",
    "moderators",
    "staff",
    "admins",
    "global_mods",
    "viewers",
  ].forEach((key) => {
    if (!Object.hasOwnProperty.call(newChatters.chatters, key)) {
      newChatters.chatters[key] = [];
    }
  });
  let users = [];
  Object.keys(newChatters.chatters).forEach((y) =>
    newChatters.chatters[y].forEach((z) => users.push({ userName: z }))
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
const populateMockVolume = (volume, srcPath) => {
  const result = {};
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

const createMockVolume = (settings = undefined) => {
  const volume = new Volume();
  volume.mkdirSync(path.resolve("."), { recursive: true });
  populateMockVolume(volume, "./src");
  if (settings !== undefined) {
    volume.fromJSON(
      { "./settings/settings.json": JSON.stringify(settings) },
      path.resolve(".")
    );
  }
  return volume;
};

/**
 * TODO: Remove this type
 * @typedef { import("../src/settings").Settings } settings
 */

/**
 * @typedef index
 * @property {Object} fs file system
 * @property {Volume} volume mock volume
 * @property {settings} settings settings
 * @property {Object} chatbot the chatbot mock
 * @property {Object} chatbot_helper the chatbot instance that `index.js` is using
 * @property {function():number} random the Math.random mock
 * @property {Object} quesoqueue the queue instance that `index.js` is using
 * @property {function(string, {username: string; displayName: string; isSubscriber: boolean; isMod: boolean; isBroadcaster: boolean;}, function(string):void):void} handle_func the function of the chatbot that receives chat messages
 */

/**
 * load `index.js` and test it being setup correctly
 *
 * @param {Volume | undefined} mockFs This virtual file system will be copied over
 * @param {settings | undefined} mockSettings {@link settings} Settings to be used
 * @param {number | Date} mockTime
 * @returns {Promise<index>} {@link index}
 */
const simRequireIndex = async (
  volume = undefined,
  mockSettings = undefined,
  mockTime = undefined,
  setupMocks = undefined
) => {
  let fs;
  let settings;
  let chatbot;
  let chatbot_helper;
  let random;
  let quesoqueue;
  let handle_func;
  let twitch;

  try {
    let main;
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

      // remove fileName setting
      if (mockSettings.fileName != null) {
        mockSettings.fileName = undefined;
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
      chatbot = require("../src/chatbot.js");
      twitch = require("../src/twitch").twitch();
      // const queue = require("../src/queue");

      // run index.js
      let idx = require("../src/index.js");
      main = idx.main;
      quesoqueue = idx.quesoqueue;
    });
    await main();

    // get hold of chatbot_helper
    expect(chatbot.helper).toHaveBeenCalledTimes(1);
    chatbot_helper = chatbot.helper.mock.results[0].value;

    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
    expect(chatbot_helper.say).toHaveBeenCalledTimes(0);

    // get hold of the handle function
    // the first argument of setup has to be an AsyncFunction
    expect(chatbot_helper.setup.mock.calls[0][0]).toBeInstanceOf(AsyncFunction);
    handle_func = chatbot_helper.setup.mock.calls[0][0];
  } catch (err) {
    console.warn(err);
    err.simIndex = {
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
    throw err;
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
const simAdvanceTime = async (ms, accuracy = 0) => {
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
  expect(new Date() - currentTime).toEqual(ms);
};

/**
 * Sets the time to the given time and adds a day in case time would have gone backwards.
 * Also runs timers and waits for async timers to run.
 *
 * @param {string|Date} time Time in the format `HH:mm:ss` in UTC or a Date.
 * @param {number} accuracy How accurate timers are being simulated, in milliseconds
 */
const simSetTime = async (time, accuracy = 0) => {
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
  const diff = newTime - prevTime;
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
  username,
  displayName,
  isSubscriber,
  isMod,
  isBroadcaster
) => {
  return { username, displayName, isSubscriber, isMod, isBroadcaster };
};

const replace = (settings, newSettings) => {
  Object.keys(settings).forEach((key) => {
    delete settings[key];
  });
  Object.assign(settings, newSettings);
};

const newLevel = (
  level_code,
  submitterOrUser,
  username = undefined,
  type = undefined
) => {
  if (type === undefined) {
    type = "smm2";
  }
  if (typeof submitterOrUser === "string" && typeof username === "string") {
    return {
      code: level_code,
      type,
      submitter: submitterOrUser,
      username: username,
    };
  } else if (typeof submitterOrUser === "object" && username === undefined) {
    return {
      code: level_code,
      type,
      submitter: submitterOrUser.displayName,
      username: submitterOrUser.username,
    };
  } else {
    throw new Error(
      `newLevel called with invalid arguments: submitterOrUser=${submitterOrUser}, username=${username}`
    );
  }
};

module.exports = {
  simRequireIndex,
  simAdvanceTime,
  simSetTime,
  simSetChatters,
  buildChatter,
  createMockVolume,
  replace,
  newLevel,
  flushPromises,
  clearAllTimers,
  START_TIME,
  DEFAULT_TEST_SETTINGS,
  EMPTY_CHATTERS,
};
