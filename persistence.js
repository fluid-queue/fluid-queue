const settings = require('./settings.js');
const fs = require('fs');
const gracefulFs = require("graceful-fs");
const writeFileAtomic = require('write-file-atomic');
const writeFileAtomicSync = writeFileAtomic.sync;
const { Waiting } = require("./waiting.js");

const FILENAME_V1 = { queso: './queso.save', userOnlineTime: './userOnlineTime.txt', userWaitTime: './userWaitTime.txt', waitingUsers: './waitingUsers.txt' };
const FILENAME_V2 = { directory: './data', fileName: './data/queue.json' };
const VERSION_V2 = '2.1';
const VERSION_CHECK_V2 = /^2(\.|$)/; // the version that is being accepted
const CUSTOM_CODES_FILENAME = './customCodes.json';

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

// structure of file format V2:
// data/queue.json
//   an object containing the following fields:
//     - version: will have the value "2.0" for now,
//                but might change to "2.1", or "3.0", etc. later
//                the queue accepts anything starting with "2." and will reject the file otherwise (crash)
//     - currentLevel: null or the current level
//     - queue: list of levels (not including the current level)
//     - waiting: map of username to waiting information
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

const patchGlobalFs = () => {
    gracefulFs.gracefulify(fs);
};

const hasOwn = (object, property) => {
    return Object.prototype.hasOwnProperty.call(object, property);
};

const loadFileDefault = (fileName, newContent, errorMessage) => {
    if (fs.existsSync(fileName)) {
        try {
            const fileContents = JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }));
            console.log(`${fileName} has been successfully validated.`);
            return fileContents;
        } catch (err) {
            console.warn('An error occurred when trying to load %s. %s', fileName, errorMessage, err);
            // let it crash!
            throw err;
        }
    }
    return newContent;
};

const loadFileOrCreate = (fileName, createFunction, errorMessage) => {
    const load = (create = false) => {
        try {
            if (create) {
                createFunction();
            }
            const fileContents = JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }));
            console.log('%s has been successfully%s validated.', fileName, create ? ' created and' : '');
            return fileContents;
        } catch (err) {
            console.warn('An error occurred when trying to %s %s. %s', create ? 'create' : 'load', fileName, errorMessage, err);
            // let it crash!
            throw err;
        }
    };
    if (fs.existsSync(fileName)) {
        return load();
    }
    return load(true);
};

const loadQueueV1 = () => {
    const cache_filename = FILENAME_V1.queso;
    const now = (new Date()).toISOString();
    let levels = [];
    let currentLevel;
    // load levels
    if (fs.existsSync(cache_filename)) {
        const raw_data = fs.readFileSync(cache_filename, { encoding: "utf8" });
        levels = JSON.parse(raw_data);
        const username_missing = level => !hasOwn(level, 'username');
        if (levels.some(username_missing)) {
            console.warn(`Usernames are not set in the file ${cache_filename}!`);
            console.warn('Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names.');
            console.warn('To be safe, clear the queue with !clear.');
            levels.forEach(level => {
                if (username_missing(level)) {
                    level.username = level.submitter.toLowerCase();
                }
            });
        }
        // Find the current level
        const isCurrent = level => hasOwn(level, 'current_level') && level.current_level;
        // Make sure to remove the current_property levels for all levels
        const rmCurrent = level => { let result = { ...level }; delete result.current_level; return result; };
        const currentLevels = levels.filter(isCurrent).map(rmCurrent);
        if (currentLevels.length == 1) {
            currentLevel = currentLevels[0];
            levels = levels.filter(x => !isCurrent(x)).map(rmCurrent);
        } else {
            if (currentLevels.length > 1) {
                console.warn('More than one level in the queue is marked as the current level.');
                console.warn('This will be ignored and no level will be marked as the current level.');
            }
            currentLevel = undefined;
            levels = levels.map(rmCurrent);
        }
    }
    // load wait time
    const waitingUsers = loadFileDefault(FILENAME_V1.waitingUsers, [], 'Weighted chance will not function.');
    const userWaitTime = loadFileDefault(FILENAME_V1.userWaitTime, [], 'Weighted chance will not function.');
    if (waitingUsers.length != userWaitTime.length) {
        throw new Error(`Data is corrupt: list lenght mismatch between files ${FILENAME_V1.waitingUsers} and ${FILENAME_V1.userWaitTime}.`);
    }
    const userOnlineTime = loadFileDefault(FILENAME_V1.userOnlineTime, undefined, 'Online time will not be calculated correctly.');
    if (userOnlineTime !== undefined && waitingUsers.length != userOnlineTime.length) {
        throw new Error(`Data is corrupt: list lenght mismatch between files ${FILENAME_V1.waitingUsers} and ${FILENAME_V1.userOnlineTime}.`);
    }
    // convert wait time to object
    const waiting = waitingToObject(waitingUsers, userWaitTime, userOnlineTime, now);
    // now add anyone who is in the queue, but not waiting
    // note: the current level does not have a wait time!
    levels.forEach((level) => {
        if (!hasOwn(waiting, level.username)) {
            waiting[level.username] = Waiting.create(now);
        }
    });
    return {
        currentLevel,
        queue: levels,
        waiting,
    };
};

const waitingToObject = (waitingUsers, userWaitTime, userOnlineTime = undefined, now = undefined) => {
    if (now === undefined) {
        now = (new Date()).toISOString();
    }
    const waiting = {};
    for (let index = 0; index < waitingUsers.length; index++) {
        const username = waitingUsers[index];
        const waitTime = userWaitTime[index];
        const lastOnlineTime = userOnlineTime === undefined ? now : userOnlineTime[index];
        waiting[username] = Waiting.fromV1(waitTime, lastOnlineTime);
    }
    return waiting;
};

const loadQueueV2 = () => {
    const fileName = FILENAME_V2.fileName;
    const state = JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }));
    if (!hasOwn(state, 'version')) {
        throw new Error(`Queue save file ${fileName}: no version field.`);
    } else if (typeof state.version !== 'string') {
        throw new Error(`Queue save file ${fileName}: version is not of type string.`);
    } else if (!VERSION_CHECK_V2.test(state.version)) {
        throw new Error(`Queue save file ${fileName}: version in file "${state.version}" is not compatible with queue save file version "${VERSION_V2}". Save file is assumed to be incompatible. Did you downgrade versions?`);
    }
    if (state.currentLevel === null) {
        state.currentLevel = undefined;
    }
    // convert waiting entries to Waiting objects
    state.waiting = Object.fromEntries(Object.entries(state.waiting)
        .map(([key, value]) => [key, Waiting.from(value)]));
    console.log(`${fileName} has been successfully validated.`);
    return state;
};

const createEmptyQueueSync = () => {
    const empty = {
        currentLevel: undefined,
        queue: [],
        waiting: {},
    };
    saveQueueSync(empty.currentLevel, empty.queue, empty.waiting);
    console.log(`${FILENAME_V2.fileName} has been successfully created.`);
};

const loadQueueSync = () => {
    // try to load queue version 2 if file exists
    if (fs.existsSync(FILENAME_V2.fileName)) {
        // for now notice the user of previous save files that can be removed
        // TODO: this is optional and can be removed
        Object.values(FILENAME_V1).forEach(file => {
            if (fs.existsSync(file)) {
                console.log(`${file} is no longer needed and can be deleted.`);
            }
        });
        return loadQueueV2();
    }
    // if version 2 file does not exist and any version 1 file exists try to convert version 1 to version 2
    if (Object.values(FILENAME_V1).some(file => fs.existsSync(file))) {
        const stateV1 = loadQueueV1();
        saveQueueSync(stateV1.currentLevel, stateV1.queue, stateV1.waiting);
        console.log(`${FILENAME_V2.fileName} has been successfully created from previous save files.`);
        const stateV2 = loadQueueV2();
        // at this point assume everything was converted successfully (an error would have been thrown instead)
        // now delete version 1 files
        Object.values(FILENAME_V1).forEach(file => {
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                    console.log(`${file} has been deleted successfully.`);
                } catch (err) {
                    console.warn('%s could not be deleted.', file, err);
                    // this error can be safely ignored!
                }
            }
        });
        return stateV2;
    }
    // create an empty save file
    createEmptyQueueSync();
    return loadQueueV2();
};

const createSaveFileContent = (currentLevel, queue, waiting) => {
    return JSON.stringify(
        {
            version: VERSION_V2,
            currentLevel: currentLevel === undefined ? null : currentLevel,
            queue,
            waiting,
        },
        null,
        settings.prettySaveFiles ? 2 : 0
    );
};

const saveQueueSync = (currentLevel, queue, waiting) => {
    try {
        writeFileAtomicSync(FILENAME_V2.fileName, createSaveFileContent(currentLevel, queue, waiting));
        return true;
    } catch (err) {
        console.error('%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.', FILENAME_V2.fileName, err);
        // ignore this error and keep going
        // hopefully this issue is gone on the next save
        // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
        return false;
    }
};

const saveQueue = async (currentLevel, queue, waiting, callback = undefined) => {
    try {
        await writeFileAtomic(FILENAME_V2.fileName, createSaveFileContent(currentLevel, queue, waiting), callback);
        return true;
    } catch (err) {
        console.error('%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.', FILENAME_V2.fileName, err);
        // ignore this error and keep going
        // hopefully this issue is gone on the next save
        // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
        return false;
    }
};

const loadCustomCodesSync = () => {
    const codeList = loadFileOrCreate(CUSTOM_CODES_FILENAME, () => saveCustomCodesSync([]), 'Custom codes will not function.');
    return codeList;
};

const saveCustomCodesSync = (codeList, errorMessage = undefined) => {
    try {
        writeFileAtomicSync(CUSTOM_CODES_FILENAME, JSON.stringify(codeList));
    } catch (err) {
        if (errorMessage !== undefined) {
            console.warn(errorMessage);
        }
        console.error('%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.', CUSTOM_CODES_FILENAME, err);
        // ignore this error and keep going
        // hopefully this issue is gone on the next save
        // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
    }
};

const createDataDirectory = () => {
    if (!fs.existsSync(FILENAME_V2.directory)) {
        fs.mkdirSync(FILENAME_V2.directory, { recursive: true });
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
};
