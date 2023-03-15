const settings = require("./settings.js");
const fs = require("fs");
const gracefulFs = require("graceful-fs");
const writeFileAtomic = require("write-file-atomic");
const writeFileAtomicSync = writeFileAtomic.sync;
const { Waiting } = require("./waiting.js");
const { v5: uuidv5 } = require("uuid");
const path = require("path");

const DATA_DIRECTORY = "data";
const QUEUE_V2 = {
  fileName: path.join(DATA_DIRECTORY, "queue.json"),
  version: "2.2", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
};
const CUSTOM_CODES_V2 = {
  fileName: path.join(DATA_DIRECTORY, "custom-codes.json"),
  version: "2.0", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
};
const QUEUE_NAMESPACE = "1e511052-e714-49bb-8564-b60915cf7279"; // this is the namespace for *known* level types for the queue (Version 4 UUID)

// legacy files that are converted at startup
const QUEUE_V1 = {
  queso: "queso.save",
  userOnlineTime: "userOnlineTime.txt",
  userWaitTime: "userWaitTime.txt",
  waitingUsers: "waitingUsers.txt",
  // `customCodes.json` is not in here, because it would be deleted by the queue file creation
};
const CUSTOM_CODES_V1 = {
  customCodes: "customCodes.json",
};
const LEGACY_CUSTOM_CODES = ["R0M-HAK-LVL", "UNC-LEA-RED"]; // these level codes have been used for custom level types before introducing custom level types with UUIDs

// structure of file format V1:
// queso.save
//   contains levels in a list as a JSON
//   each level has the following fields:
//     - code: contains the level code as a string
//     - submitter: contains the display name of the submitter
//     - username: contains the username of the submitter
//     - current_level (optional, default is false): boolean if it is the level that is currently being played
// waitingUsers.txt
//   contains usernames in a list as a JSON
// userWaitTime.txt
//   contains the wait time in minutes in a list as a JSON
//   where each entry corresponds to the user in the usernames list
// userOnlineTime.txt
//   contains the time someone was last online in the queue
//   as an ISO 8601 timestamp string in a list as a JSON
//   where each entry corresponds to the user in the usernames list
// customCodes.json
//   a list of tuples where the key (first value of the tuple) is a custom code
//   and the value (second value of the tuple) is the level code

// structure of file format V2:
// data/queue.json
//   an object containing the following fields:
//     - version: will have the value "2.0" for now,
//                but might change to "2.1", or "3.0", etc. later
//                the queue accepts anything starting with "2." and will reject the file otherwise (crash)
//                this version is independant of the npm version
//     - currentLevel: null or the current level
//     - queue: list of levels (not including the current level)
//     - waiting: map of username to waiting information
//     - custom: map of uuid to a description of what kind of level it is
//   a level has the following fields:
//     - code: contains the level code as a string
//     - submitter: contains the display name of the submitter
//     - username: contains the username of the submitter
//   waiting information has the following fields:
//     - userId (optional): the twitch user id
//     - waitTime: integer, the wait time in minutes
//     - weightMin: integer, the weighted time for weighted random in minutes
//     - weightMsec: integer, the milliseconds part of the weight time, between 0 (inclusive) and 59999 (inclusive)
//     - lastOnlineTime: string, ISO 8601 timestamp
// data/custom-codes.json
//   an object containing the following fields:
//     - version: will have the value "2.0" for now,
//                but might change to "2.1", or "3.0", etc. later
//                the queue accepts anything starting with "2." and will reject the file otherwise (crash)
//                this version is independant of the npm version or queue.json version
//     - customCodes: map of custom codes, mapping custom codes to level codes

const patchGlobalFs = () => {
  gracefulFs.gracefulify(fs);
};

const hasOwn = (object, property) => {
  return Object.prototype.hasOwnProperty.call(object, property);
};

const loadFileDefault = (fileName, newContent, errorMessage = undefined) => {
  if (fs.existsSync(fileName)) {
    try {
      const fileContents = JSON.parse(
        fs.readFileSync(fileName, { encoding: "utf8" })
      );
      console.log(`${fileName} has been successfully validated.`);
      return fileContents;
    } catch (err) {
      if (errorMessage) {
        console.warn(
          "An error occurred when trying to load %s. %s",
          fileName,
          errorMessage,
          err
        );
      } else {
        console.warn(
          "An error occurred when trying to load %s.",
          fileName,
          err
        );
      }
      // let it crash!
      throw err;
    }
  }
  return newContent;
};

const loadQueueV1 = () => {
  const now = new Date().toISOString();
  let levels = [];
  let currentLevel;
  // load levels
  if (fs.existsSync(QUEUE_V1.queso)) {
    levels = loadFileDefault(QUEUE_V1.queso, []);

    const username_missing = (level) => !hasOwn(level, "username");
    if (levels.some(username_missing)) {
      console.warn(`Usernames are not set in the file ${QUEUE_V1.queso}!`);
      console.warn(
        "Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names."
      );
      console.warn("To be safe, clear the queue with !clear.");
      levels.forEach((level) => {
        if (username_missing(level)) {
          level.username = level.submitter.toLowerCase();
        }
      });
    }
    // Find the current level
    const isCurrent = (level) =>
      hasOwn(level, "current_level") && level.current_level;
    // Make sure to remove the current_property levels for all levels
    const rmCurrent = (level) => {
      let result = { ...level };
      delete result.current_level;
      return result;
    };
    const currentLevels = levels.filter(isCurrent).map(rmCurrent);
    if (currentLevels.length == 1) {
      currentLevel = currentLevels[0];
      levels = levels.filter((x) => !isCurrent(x)).map(rmCurrent);
    } else {
      if (currentLevels.length > 1) {
        console.warn(
          "More than one level in the queue is marked as the current level."
        );
        console.warn(
          "This will be ignored and no level will be marked as the current level."
        );
      }
      currentLevel = undefined;
      levels = levels.map(rmCurrent);
    }
  }
  // load wait time
  const waitingUsers = loadFileDefault(
    QUEUE_V1.waitingUsers,
    [],
    "Weighted chance will not function."
  );
  const userWaitTime = loadFileDefault(
    QUEUE_V1.userWaitTime,
    [],
    "Weighted chance will not function."
  );
  if (waitingUsers.length != userWaitTime.length) {
    throw new Error(
      `Data is corrupt: list lenght mismatch between files ${QUEUE_V1.waitingUsers} and ${QUEUE_V1.userWaitTime}.`
    );
  }
  const userOnlineTime = loadFileDefault(
    QUEUE_V1.userOnlineTime,
    undefined,
    "Online time will not be calculated correctly."
  );
  if (
    userOnlineTime !== undefined &&
    waitingUsers.length != userOnlineTime.length
  ) {
    throw new Error(
      `Data is corrupt: list lenght mismatch between files ${QUEUE_V1.waitingUsers} and ${QUEUE_V1.userOnlineTime}.`
    );
  }
  // convert wait time to object
  const waiting = waitingToObject(
    waitingUsers,
    userWaitTime,
    userOnlineTime,
    now
  );
  // now add anyone who is in the queue, but not waiting
  // note: the current level does not have a wait time!
  levels.forEach((level) => {
    if (!hasOwn(waiting, level.username)) {
      waiting[level.username] = Waiting.create(now);
    }
  });
  const custom = {};
  // find UNC-LEA-RED and R0M-HAK-LVL levels
  let hasUncleared = false;
  let hasRomHack = false;
  const checkLevel = (level) => {
    if (level.code == "UNC-LEA-RED") {
      level.code = unclearedLevelCode();
      hasUncleared = true;
    } else if (level.code == "R0M-HAK-LVL") {
      level.code = romHackLevelCode();
      hasRomHack = true;
    }
  };
  levels.forEach(checkLevel);
  if (currentLevel !== undefined) {
    checkLevel(currentLevel);
  }
  if (hasUncleared) {
    addUncleared(custom, false);
  }
  if (hasRomHack) {
    addRomHack(custom, false);
  }
  return {
    currentLevel,
    queue: levels,
    waiting,
    custom,
  };
};

const waitingToObject = (
  waitingUsers,
  userWaitTime,
  userOnlineTime = undefined,
  now = undefined
) => {
  if (now === undefined) {
    now = new Date().toISOString();
  }
  const waiting = {};
  for (let index = 0; index < waitingUsers.length; index++) {
    const username = waitingUsers[index];
    const waitTime = userWaitTime[index];
    const lastOnlineTime =
      userOnlineTime === undefined ? now : userOnlineTime[index];
    waiting[username] = Waiting.fromV1(waitTime, lastOnlineTime);
  }
  return waiting;
};

const romHackLevelCode = () => {
  const romHackUuid = uuidv5("ROMhack", QUEUE_NAMESPACE);
  return "custom:" + romHackUuid;
};

const unclearedLevelCode = () => {
  const unclearedUuid = uuidv5("Uncleared", QUEUE_NAMESPACE);
  return "custom:" + unclearedUuid;
};

const addRomHack = (custom, enabled = true) => {
  const romHackUuid = uuidv5("ROMhack", QUEUE_NAMESPACE);
  if (hasOwn(custom, romHackUuid)) {
    const result = custom[romHackUuid].enabled != enabled;
    custom[romHackUuid].enabled = enabled;
    return result;
  } else {
    custom[romHackUuid] = {
      customCodes: ["ROMhack", "R0M-HAK-LVL"],
      display: "a ROMhack",
      enabled,
    };
    return true;
  }
};

const addUncleared = (custom, enabled = true) => {
  const unclearedUuid = uuidv5("Uncleared", QUEUE_NAMESPACE);
  if (hasOwn(custom, unclearedUuid)) {
    const result = custom[unclearedUuid].enabled != enabled;
    custom[unclearedUuid].enabled = enabled;
    return result;
  } else {
    custom[unclearedUuid] = {
      customCodes: ["Uncleared", "UNC-LEA-RED"],
      display: "an uncleared level",
      enabled,
    };
    return true;
  }
};

const removeRomHack = (custom) => {
  const romHackUuid = uuidv5("ROMhack", QUEUE_NAMESPACE);
  if (hasOwn(custom, romHackUuid)) {
    delete custom[romHackUuid];
    return true;
  }
  return false;
};

const removeUncleared = (custom) => {
  const unclearedUuid = uuidv5("Uncleared", QUEUE_NAMESPACE);
  if (hasOwn(custom, unclearedUuid)) {
    delete custom[unclearedUuid];
    return true;
  }
  return false;
};

const loadQueueV2 = () => {
  const fileName = QUEUE_V2.fileName;
  const state = JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }));
  if (!hasOwn(state, "version")) {
    throw new Error(`Queue save file ${fileName}: no version field.`);
  } else if (typeof state.version !== "string") {
    throw new Error(
      `Queue save file ${fileName}: version is not of type string.`
    );
  } else if (!QUEUE_V2.compatibility.test(state.version)) {
    throw new Error(
      `Queue save file ${fileName}: version in file "${state.version}" is not compatible with queue save file version "${QUEUE_V2.version}". Save file is assumed to be incompatible. Did you downgrade versions?`
    );
  }
  if (state.currentLevel === null) {
    state.currentLevel = undefined;
  }
  if (!hasOwn(state, "custom")) {
    // setup custom
    state.custom = {};
    // for version 2, 2.0, and 2.1 levels will be converted
    if (/^2(\.(0|1))?$/.test(state.version)) {
      // find UNC-LEA-RED and R0M-HAK-LVL levels
      let hasUncleared = false;
      let hasRomHack = false;
      const checkLevel = (level) => {
        if (level.code == "UNC-LEA-RED") {
          level.code = unclearedLevelCode();
          hasUncleared = true;
        } else if (level.code == "R0M-HAK-LVL") {
          level.code = romHackLevelCode();
          hasRomHack = true;
        }
      };
      state.queue.forEach(checkLevel);
      if (state.currentLevel !== undefined) {
        checkLevel(state.currentLevel);
      }
      if (hasUncleared) {
        addUncleared(state.custom, false);
      }
      if (hasRomHack) {
        addRomHack(state.custom, false);
      }
    }
  }
  // convert waiting entries to Waiting objects
  state.waiting = Object.fromEntries(
    Object.entries(state.waiting).map(([key, value]) => [
      key,
      Waiting.from(value),
    ])
  );
  console.log(`${fileName} has been successfully validated.`);
  return state;
};

const emptyQueue = () => {
  return {
    currentLevel: undefined,
    queue: [],
    waiting: {},
    custom: {},
  };
};

const emptyCustomCodes = () => {
  return {
    customCodes: {},
  };
};

const loadSync = (
  descriptorVersion2,
  loadVersion2,
  saveVersion2,
  createVersion2,
  filesVersion1,
  loadVersion1
) => {
  // try to load version 2 if file exists
  if (fs.existsSync(descriptorVersion2.fileName)) {
    // for now notice the user of previous save files that can be removed
    // TODO: this is optional and can be removed
    Object.values(filesVersion1).forEach((file) => {
      if (fs.existsSync(file)) {
        console.log(`${file} is no longer needed and can be deleted.`);
      }
    });
    return loadVersion2();
  }
  // if version 2 file does not exist and any version 1 file exists try to convert version 1 to version 2
  if (Object.values(filesVersion1).some((file) => fs.existsSync(file))) {
    const dataVersion1 = loadVersion1();
    saveVersion2(dataVersion1);
    let filesDescription;
    if (filesVersion1.length == 1) {
      filesDescription = "a previous save file";
    } else {
      filesDescription = "previous save files";
    }
    console.log(
      `${descriptorVersion2.fileName} has been successfully created from ${filesDescription}.`
    );
    const dataVersion2 = loadVersion2();
    // at this point assume everything was converted successfully (an error would have been thrown instead)
    // now delete version 1 files
    Object.values(filesVersion1).forEach((file) => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`${file} has been deleted successfully.`);
        } catch (err) {
          console.warn("%s could not be deleted.", file, err);
          // this error can be safely ignored!
        }
      }
    });
    return dataVersion2;
  }
  // create an empty save file
  const createdVersion2 = createVersion2();
  saveVersion2(createdVersion2);
  console.log(`${descriptorVersion2.fileName} has been successfully created.`);
  return loadVersion2();
};

const loadQueueSync = () => {
  return loadSync(
    QUEUE_V2,
    loadQueueV2,
    saveQueueSync,
    emptyQueue,
    QUEUE_V1,
    loadQueueV1
  );
};

const createSaveFileContent = ({ currentLevel, queue, waiting, custom }) => {
  return JSON.stringify(
    {
      version: QUEUE_V2.version,
      currentLevel: currentLevel === undefined ? null : currentLevel,
      queue,
      waiting,
      custom,
    },
    null,
    settings.prettySaveFiles ? 2 : 0
  );
};

const createCustomCodesFileContent = ({ customCodes }) => {
  return JSON.stringify(
    {
      version: CUSTOM_CODES_V2.version,
      customCodes,
    },
    null,
    settings.prettySaveFiles ? 2 : 0
  );
};

const saveQueueSync = (data) => {
  try {
    writeFileAtomicSync(QUEUE_V2.fileName, createSaveFileContent(data));
    return true;
  } catch (err) {
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      QUEUE_V2.fileName,
      err
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
    return false;
  }
};

const saveQueue = async (data, callback = undefined) => {
  try {
    await writeFileAtomic(
      QUEUE_V2.fileName,
      createSaveFileContent(data),
      callback
    );
    return true;
  } catch (err) {
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      QUEUE_V2.fileName,
      err
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
    return false;
  }
};

const loadCustomCodesSync = () => {
  return loadSync(
    CUSTOM_CODES_V2,
    loadCustomCodesV2,
    saveCustomCodesSync,
    emptyCustomCodes,
    CUSTOM_CODES_V1,
    loadCustomCodesV1
  );
};

// returns a Map where the key is in uppercase and the entry contains an object with the unmodified `customCode` and the `levelCode`
const loadCustomCodesV1 = () => {
  let codeListEntries = loadFileDefault(
    CUSTOM_CODES_V1.customCodes,
    [],
    "Custom codes will not function."
  );
  // remove custom levels from custom codes
  codeListEntries = codeListEntries.filter(
    ([, levelCode]) => !LEGACY_CUSTOM_CODES.includes(levelCode)
  );
  const result = { customCodes: Object.fromEntries(codeListEntries) };
  return result;
};

const loadCustomCodesV2 = () => {
  const fileName = CUSTOM_CODES_V2.fileName;
  const state = JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }));
  if (!hasOwn(state, "version")) {
    throw new Error(`Custom codes save file ${fileName}: no version field.`);
  } else if (typeof state.version !== "string") {
    throw new Error(
      `Custom codes save file ${fileName}: version is not of type string.`
    );
  } else if (!CUSTOM_CODES_V2.compatibility.test(state.version)) {
    throw new Error(
      `Custom codes save file ${fileName}: version in file "${state.version}" is not compatible with custom codes save file version "${CUSTOM_CODES_V2.version}". Save file is assumed to be incompatible. Did you downgrade versions?`
    );
  }
  console.log(`${fileName} has been successfully validated.`);
  return state;
};

const saveCustomCodesSync = (data, errorMessage = undefined) => {
  try {
    writeFileAtomicSync(
      CUSTOM_CODES_V2.fileName,
      createCustomCodesFileContent(data)
    );
  } catch (err) {
    if (errorMessage !== undefined) {
      console.warn(errorMessage);
    }
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      CUSTOM_CODES_V2.fileName,
      err
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
  }
};

const createDataDirectory = () => {
  if (!fs.existsSync(DATA_DIRECTORY)) {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  }
};

module.exports = {
  loadQueueSync,
  saveQueueSync,
  saveQueue,
  createDataDirectory,
  loadCustomCodesSync,
  saveCustomCodesSync,
  patchGlobalFs,
  romHackLevelCode,
  unclearedLevelCode,
  addRomHack,
  addUncleared,
  removeRomHack,
  removeUncleared,
};
