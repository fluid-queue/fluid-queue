"use strict";

// imports
const path = require("path");
const fs = require("fs");
const {
  simRequireIndex,
  simSetChatters,
  createMockVolume,
  START_TIME,
  EMPTY_CHATTERS,
  DEFAULT_TEST_SETTINGS,
} = require("../simulation.js");

// fake timers
jest.useFakeTimers();
// console checks
const consoleWarnMock = jest.spyOn(global.console, "warn");
const consoleErrorMock = jest.spyOn(global.console, "error");

beforeEach(() => {
  // reset chatters
  simSetChatters(EMPTY_CHATTERS);

  // reset time
  jest.setSystemTime(START_TIME);

  // reset console
  consoleWarnMock.mockClear();
  consoleErrorMock.mockClear();
});

const copy = (volume, realFs, mockFileName, realFileName) => {
  if (realFs.existsSync(realFileName)) {
    volume.fromJSON(
      { [mockFileName]: realFs.readFileSync(realFileName, "utf-8") },
      path.resolve(".")
    );
  }
};

const loadVolume = (testFolder) => {
  let volume = createMockVolume();
  copy(
    volume,
    fs,
    "./queso.save",
    path.resolve(__dirname, `data/${testFolder}/queso.save`)
  );
  copy(
    volume,
    fs,
    "./userWaitTime.txt",
    path.resolve(__dirname, `data/${testFolder}/userWaitTime.txt`)
  );
  copy(
    volume,
    fs,
    "./waitingUsers.txt",
    path.resolve(__dirname, `data/${testFolder}/waitingUsers.txt`)
  );
  return volume;
};

const loadVolumeV2 = (testFolder, version = "2.0") => {
  let volume = createMockVolume();
  volume.mkdirSync("./data");
  copy(
    volume,
    fs,
    "./data/queue.json",
    path.resolve(__dirname, `data/${testFolder}/queue-v${version}.json`)
  );
  return volume;
};

const checkResult = (mockFs, realFs, testFolder, version = undefined) => {
  let queue_real = JSON.parse(mockFs.readFileSync("./data/queue.json"));
  let queue_expect;
  if (version === undefined) {
    queue_expect = JSON.parse(
      realFs.readFileSync(
        path.resolve(__dirname, `data/${testFolder}/queue.json`)
      )
    );
  } else {
    queue_expect = JSON.parse(
      realFs.readFileSync(
        path.resolve(__dirname, `data/${testFolder}/queue-v${version}.json`)
      )
    );
  }
  expect(queue_real).toEqual(queue_expect);
};

const checkCustomCodes = (mockFs, realFs, testFolder, version = undefined) => {
  let queue_real = JSON.parse(
    mockFs.readFileSync("./data/extensions/customcode.json")
  );
  let queue_expect;
  if (version === undefined) {
    queue_expect = JSON.parse(
      realFs.readFileSync(
        path.resolve(__dirname, `data/${testFolder}/customcode.json`)
      )
    );
  } else {
    queue_expect = JSON.parse(
      realFs.readFileSync(
        path.resolve(
          __dirname,
          `data/${testFolder}/customcode-v${version}.json`
        )
      )
    );
  }
  expect(queue_real).toEqual(queue_expect);
};

test("conversion-test-empty", async () => {
  const test = "test-empty";
  const volume = loadVolume(test);
  // empty file system
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors!
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  expect(mockFs.existsSync("./data/extensions/customcode.json")).toBe(false);
});

test("conversion-test-empty-custom-codes-enabled", async () => {
  const test = "test-empty-custom-codes-enabled";
  const volume = loadVolume(test);
  // empty file system
  const index = await simRequireIndex(volume, {
    ...DEFAULT_TEST_SETTINGS,
    custom_codes_enabled: true,
  });
  const mockFs = index.fs;
  // should load without errors!
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  expect(mockFs.existsSync("./data/extensions/customcode.json")).toBe(true);
  checkCustomCodes(mockFs, fs, test);
});

test("custom-codes-empty", async () => {
  const test = "custom-codes-empty";
  const volume = loadVolume(test);
  // empty file system
  const index = await simRequireIndex(volume, {
    ...DEFAULT_TEST_SETTINGS,
    custom_codes_enabled: true,
  });
  const mockFs = index.fs;
  // should load without errors!
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  checkCustomCodes(mockFs, fs, test);
  // no old files have been created
  expect(mockFs.existsSync("./customCodes.json")).toBe(false);
});

test("custom-codes-v1a-to-v2.0", async () => {
  const test = "custom-codes-v1a-to-v2.0";
  const volume = loadVolume(test);
  copy(
    volume,
    fs,
    "./customCodes.json",
    path.resolve(__dirname, `data/${test}/customCodes.json`)
  );
  // customCodes.json present
  const index = await simRequireIndex(volume, {
    ...DEFAULT_TEST_SETTINGS,
    custom_codes_enabled: true,
  });
  const mockFs = index.fs;
  // should load without errors!
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  checkCustomCodes(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./customCodes.json")).toBe(false);
});

test("custom-codes-v1b-to-v2.0", async () => {
  const test = "custom-codes-v1b-to-v2.0";
  const volume = loadVolume(test);
  copy(
    volume,
    fs,
    "./customCodes.json",
    path.resolve(__dirname, `data/${test}/customCodes.json`)
  );
  // customCodes.json present
  const index = await simRequireIndex(volume, {
    ...DEFAULT_TEST_SETTINGS,
    custom_codes_enabled: true,
  });
  const mockFs = index.fs;
  // should load without errors!
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  checkCustomCodes(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./customCodes.json")).toBe(false);
});

test("conversion-test-1", async () => {
  const test = "test-1";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors, but a warning in the console
  expect(consoleWarnMock).toHaveBeenCalledWith(
    "Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names."
  );
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // no old files have been created
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("conversion-test-2", async () => {
  const test = "test-2";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("conversion-test-3", async () => {
  const test = "test-3";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("conversion-test-4", async () => {
  const test = "test-4";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("conversion-test-5", async () => {
  const test = "test-5";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

const expectErrorMessage = (promise) => {
  console.log("promise???", promise);
  return expect(
    promise.then(
      (value) => value,
      (reason) => {
        console.log(reason);
        if (reason.constructor === Error) {
          expect(reason.constructor).toBe(Error);
        } else {
          expect(Object.getPrototypeOf(reason.constructor)).toBe(Error);
        }
        return Promise.reject(reason.message);
      }
    )
  ).rejects;
};

test("conversion-test-corrupt-1", async () => {
  const test = "test-corrupt-1";
  const volume = loadVolume(test);
  let mockFs;

  const index = async () => {
    try {
      await simRequireIndex(volume);
    } catch (err) {
      mockFs = err.simIndex.fs;
      throw err;
    }
  };
  // should error!
  await expectErrorMessage(index()).toMatch(/.*/); // TODO regex of expected error message
  // check file system -> old file still exists -> no loss of data on conversion error!
  expect(mockFs.existsSync("./queso.save")).toBe(true);
});

test("conversion-test-corrupt-2", async () => {
  const test = "test-corrupt-2";
  const volume = loadVolume(test);
  let mockFs;

  const index = async () => {
    try {
      await simRequireIndex(volume);
    } catch (err) {
      mockFs = err.simIndex.fs;
      throw err;
    }
  };
  // should error!
  await expectErrorMessage(index()).toMatch(/.*/); // TODO regex of expected error message
  // check file system -> old files still exists -> no loss of data on conversion error!
  expect(mockFs.existsSync("./queso.save")).toBe(true);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(true);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(true);
});

test("conversion-test-corrupt-3", async () => {
  const test = "test-corrupt-3";
  const volume = loadVolume(test);
  let mockFs;

  const index = async () => {
    try {
      await simRequireIndex(volume);
    } catch (err) {
      mockFs = err.simIndex.fs;
      throw err;
    }
  };
  // should error!
  await expectErrorMessage(index()).toMatch(/.*/); // TODO regex of expected error message
  // check file system -> old files still exists -> no loss of data on conversion error!
  expect(mockFs.existsSync("./queso.save")).toBe(true);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(true);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(true);
});

test("conversion-test-corrupt-4", async () => {
  const test = "test-corrupt-4";
  const volume = loadVolume(test);
  let mockFs;

  const index = async () => {
    try {
      await simRequireIndex(volume);
    } catch (err) {
      mockFs = err.simIndex.fs;
      throw err;
    }
  };
  // should error!
  await expectErrorMessage(index()).toMatch(/.*/); // TODO regex of expected error message
  // check file system -> old files still exists -> no loss of data on conversion error!
  expect(mockFs.existsSync("./queso.save")).toBe(true);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false); // this file is actually missing on purpose
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(true);
});

test("conversion-test-v2.0-to-v2.2", async () => {
  const test = "test-v2.0-to-v2.2";
  const volume = loadVolumeV2(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  // queue will be saved immediately
  checkResult(mockFs, fs, test, "2.2");
});

test("conversion-test-v2.1-to-v2.2", async () => {
  const test = "test-v2.1-to-v2.2";
  const volume = loadVolumeV2(test, "2.1");
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  // queue will be saved immediately
  checkResult(mockFs, fs, test, "2.2");
});

test("custom-levels-v1a-to-v2.2", async () => {
  const test = "custom-levels-v1a-to-v2.2";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors, but a warning in the console
  expect(consoleWarnMock).toHaveBeenCalledWith(
    "Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names."
  );
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // no old files have been created
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("custom-levels-v1b-to-v2.2", async () => {
  const test = "custom-levels-v1b-to-v2.2";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("custom-levels-v1c-to-v2.2", async () => {
  const test = "custom-levels-v1c-to-v2.2";
  const volume = loadVolume(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  checkResult(mockFs, fs, test);
  // old files have been deleted
  expect(mockFs.existsSync("./queso.save")).toBe(false);
  expect(mockFs.existsSync("./userWaitTime.txt")).toBe(false);
  expect(mockFs.existsSync("./waitingUsers.txt")).toBe(false);
});

test("custom-levels-v2.0-to-v2.2", async () => {
  const test = "custom-levels-v2.0-to-v2.2";
  const volume = loadVolumeV2(test);
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  // queue will be saved immediately
  checkResult(mockFs, fs, test, "2.2");
});

test("custom-levels-v2.1-to-v2.2", async () => {
  const test = "custom-levels-v2.1-to-v2.2";
  const volume = loadVolumeV2(test, "2.1");
  const index = await simRequireIndex(volume);
  const mockFs = index.fs;
  // should load without errors and no exception was thrown
  expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  // queue will be saved immediately
  checkResult(mockFs, fs, test, "2.2");
});
