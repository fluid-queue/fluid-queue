const fs = require('fs');
const writeFileAtomic = require('write-file-atomic');
const writeFileAtomicSync = require('write-file-atomic').sync;

const FILENAME_V1 = { queso: './queso.save', userOnlineTime: './userOnlineTime.txt', userWaitTime: './userWaitTime.txt', waitingUsers: './waitingUsers.txt' };
const FILENAME_V2 = { directory: './data', fileName: './data/queue.json' };
const VERSION_V2 = '2.0';
const VERSION_CHECK_V2 = /^2(\.|$)/; // the version that is being accepted

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
//     - lastOnlineTime: string, ISO 8601 timestamp

const loadFileDefault = (fileName, newContent, errorMessage) => {
    if (fs.existsSync(fileName)) {
        try {
            const fileContents = JSON.parse(fs.readFileSync(fileName));
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

const loadQueueV1 = () => {
    const cache_filename = FILENAME_V1.queso;
    let levels = new Array();
    let currentLevel = undefined;
    // load levels
    if (fs.existsSync(cache_filename)) {
        const raw_data = fs.readFileSync(cache_filename);
        levels = JSON.parse(raw_data);
        const username_missing = level => !Object.hasOwn(level, 'username');
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
        const is_current = level => Object.hasOwn(level, 'current_level') && level.current_level;
        // Make sure to remove the current_property levels for all levels
        const rm_current = level => { let result = { ...level }; delete result.current_level; return result; };
        const currentLevels = levels.filter(is_current).map(rm_current);
        if (currentLevels.length == 1) {
            currentLevel = currentLevels[0];
            levels = levels.filter(x => !is_current(x)).map(rm_current);
        } else {
            if (currentLevels.length > 1) {
                console.warn('More than one level in the queue is marked as the current level.');
                console.warn('This will be ignored and no level will be marked as the current level.');
            }
            currentLevel = undefined;
            levels = levels.map(rm_current);
        }
    }
    // load wait time
    const waitingUsers = loadFileDefault(FILENAME_V1.waitingUsers, [], 'Weighted chance will not function.');
    const userWaitTime = loadFileDefault(FILENAME_V1.userWaitTime, [], 'Weighted chance will not function.');
    const userOnlineTime = loadFileDefault(FILENAME_V1.userOnlineTime, undefined, 'Online time will not be calculated correctly.');
    // convert wait time to map
    const waiting = waitingToObject(waitingUsers, userWaitTime, userOnlineTime);
    return {
        currentLevel,
        queue: levels,
        waiting,
    };
};

const waitingToObject = (waitingUsers, userWaitTime, userOnlineTime = undefined) => {
    const now = (new Date()).toISOString();
    const waiting = {};
    for (let index = 0; index < waitingUsers.length; index++) {
        const username = waitingUsers[index];
        const waitTime = userWaitTime[index];
        const lastOnlineTime = userOnlineTime === undefined ? now : userOnlineTime[index];
        waiting[username] = {
            waitTime,
            lastOnlineTime
        };
    }
    return waiting;
};

const waitingFromObject = (waiting) => {
    const waitingUsers = Object.keys(waiting);
    const userWaitTime = waitingUsers.map(username => waiting[username].waitTime);
    const lastOnlineTime = waitingUsers.map(username => waiting[username].lastOnlineTime);
    return {
        waitingUsers,
        userWaitTime,
        lastOnlineTime
    };
};

const loadQueueV2 = () => {
    const fileName = FILENAME_V2.fileName;
    const state = JSON.parse(fs.readFileSync(fileName));
    if (!Object.hasOwn(state, 'version')) {
        throw new Error(`Queue save file ${fileName}: no version field.`);
    } else if (typeof state.version !== 'string') {
        throw new Error(`Queue save file ${fileName}: version is not of type string.`);
    } else if (!VERSION_CHECK_V2.test(state.version)) {
        throw new Error(`Queue save file ${fileName}: version in file "${state.version}" is not compatible with queue save file version "${VERSION_V2}".`);
    }
    if (state.currentLevel === null) {
        state.currentLevel = undefined;
    }
    state.waiting = new Map(Object.entries(state.waiting));
    console.log(`${fileName} has been successfully validated.`);
    return state;
};

const loadQueueSync = () => {
    // try to load queue version 2 if file exists
    // if version 2 file does not exist, try to convert version 1 to version 2
    // if version 1 files do not exist, create an empty save file
    if (fs.existsSync(FILENAME_V2.fileName)) {
        return loadQueueV2();
    }
    // load version 1 (or create new save)
    const state = loadQueueV1();
    saveQueueSync(state.currentLevel, state.queue, state.waiting);
    console.log(`${FILENAME_V2.fileName} has been successfully created.`);
    return state;
};

const saveQueueSync = (currentLevel, queue, waiting) => {
    const state = {
        version: VERSION_V2,
        currentLevel: currentLevel === undefined ? null : currentLevel,
        queue,
        waiting,
    };
    writeFileAtomicSync(FILENAME_V2.fileName, JSON.stringify(state));
};

const saveQueue = async (currentLevel, queue, waiting, callback = undefined) => {
    const state = {
        version: VERSION_V2,
        currentLevel: currentLevel === undefined ? null : currentLevel,
        queue,
        waiting,
    };
    await writeFileAtomic(FILENAME_V2.fileName, JSON.stringify(state), callback);
};

const createDataDirectory = () => {
    if (!fs.existsSync(FILENAME_V2.directory)){
        fs.mkdirSync(FILENAME_V2.directory, { recursive: true });
    }
};

module.exports = {
    loadQueueSync,
    saveQueueSync,
    saveQueue,
    createDataDirectory,
    waitingToObject,
    waitingFromObject,
};
