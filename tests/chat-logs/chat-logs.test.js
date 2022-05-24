'use strict';

// imports
const jestChance = require('jest-chance');
// var tk = require('timekeeper');
const readline = require('readline');
const { fail } = require('assert');
const { Volume } = require('memfs');
const path = require('path');
const fs = require('fs');
const { codeFrameColumns } = require('@babel/code-frame');

// constants
const AsyncFunction = (async () => { }).constructor;
const defaultTestChatters = {
    _links: {},
    chatter_count: 0,
    chatters: { broadcaster: [], vips: [], moderators: [], staff: [], admins: [], global_mods: [], viewers: [] }
};
const defaultTestSettings = {
    username: 'queso_queue_test_username',
    password: '',
    channel: 'queso_queue_test_channel',
    max_size: 50,
    level_timeout: 10,
    level_selection: ['next', 'subnext', 'modnext', 'random', 'subrandom', 'modrandom'],
    message_cooldown: 5,
};
const isPronoun = (text) => {
    return text == 'Any' || text == 'Other' || text.includes('/');
};

// mock variables
var mockChatters = undefined;

// mocks
jest.mock('../../chatbot.js');
jest.mock('node-fetch', () => jest.fn());

// only import after mocking!
const fetch = require("node-fetch");

// mock fetch
fetch.mockImplementation(() =>
    Promise.resolve({
        json: () => Promise.resolve(mockChatters),
    })
);

// fake timers
jest.useFakeTimers();

const flushPromises = () => {
    return new Promise(jest.requireActual("timers").setImmediate);
};

const advanceTime = async (ms, accuracy = 0) => {
    // advance by accuracy intervals
    if (accuracy > 0) {
        for (let i = 0; i < ms; i += accuracy) {
            let advance = Math.min(accuracy, ms - i);
            jest.advanceTimersByTime(advance);
            await flushPromises();
        }
    } else {
        jest.advanceTimersByTime(ms);
        await flushPromises();
    }
};

const setTime = async (time, accuracy = 0) => {
    let prevTime = new Date();
    let newTime = new Date();
    let timeArray = time.split(':').map(x => parseInt(x, 10));
    newTime.setUTCHours(timeArray[0]);
    newTime.setUTCMinutes(timeArray[1]);
    newTime.setUTCSeconds(timeArray[2]);
    if (newTime < prevTime) {
        // add one day in case of time going backwards
        newTime.setUTCDate(newTime.getUTCDate() + 1);
    }
    const diff = newTime - prevTime;
    if (diff > 0) {
        await advanceTime(diff, accuracy);
    } else if (diff < 0) {
        fail(`Time went backwards, from ${prevTime} to ${newTime} (${time})`);
    }
}

const replaceSettings = (settings, newSettings) => {
    Object.keys(settings).forEach(key => { delete settings[key]; });
    Object.assign(settings, newSettings);
};

const setChatters = (newChatters) => {
    // automatically create a correct chatters object
    if (!newChatters.hasOwnProperty('chatters')) {
        newChatters = {
            _links: {},
            chatter_count: Object.values(newChatters).flat().length,
            chatters: newChatters
        };
    }
    mockChatters = newChatters;
};

beforeEach(() => {
    // reset fetch
    fetch.mockClear();
    setChatters(defaultTestChatters);

    // reset time
    jest.setSystemTime(new Date('2022-04-21T00:00:00Z'));
});

// load index.js and test it being setup correctly
function requireIndex(mockFs = undefined, mockSettings = undefined) {
    let fs;
    let settings;
    let chatbot;
    let chatbot_helper;
    let random;
    let quesoqueue;
    let handle_func;

    jest.isolateModules(() => {
        // setup random mock
        const chance = jestChance.getChance();
        random = jest
            .spyOn(global.Math, 'random')
            .mockImplementation(() => {
                return chance.random();
            });

        // create virtual file system
        if (mockFs === undefined) {
            mockFs = new Volume();
            mockFs.mkdirSync(path.resolve('.'), { recursive: true });
            mockFs.writeFileSync(path.resolve('./waitingUsers.txt'), '[]');
            mockFs.writeFileSync(path.resolve('./userWaitTime.txt'), '[]');
        }
        // setup virtual file system
        jest.mock('fs', () => mockFs);
        fs = require('fs');

        // setup settings mock
        jest.mock('../../settings.js', () => { return {}; });

        // import settings and replace them
        settings = require('../../settings.js');
        if (mockSettings === undefined) {
            mockSettings = defaultTestSettings;
        }
        replaceSettings(settings, mockSettings);

        // import libraries
        chatbot = require('../../chatbot.js');
        const queue = require('../../queue.js');

        // spy on the quesoqueue that index will use
        const quesoqueueSpy = jest.spyOn(queue, 'quesoqueue');

        // run index.js
        require('../../index.js');

        // get hold of the queue
        expect(quesoqueueSpy).toHaveBeenCalledTimes(1);
        quesoqueue = quesoqueueSpy.mock.results[0].value;
        quesoqueueSpy.mockRestore();

        // get hold of chatbot_helper
        expect(chatbot.helper).toHaveBeenCalledTimes(1);
        chatbot_helper = chatbot.helper.mock.results[0].value;

        expect(chatbot_helper.setup).toHaveBeenCalledTimes(1)
        expect(chatbot_helper.connect).toHaveBeenCalledTimes(1);
        expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
        expect(chatbot_helper.say).toHaveBeenCalledTimes(0);

        // get hold of the handle function
        // the first argument of setup has to be an AsyncFunction
        expect(chatbot_helper.setup.mock.calls[0][0]).toBeInstanceOf(AsyncFunction);
        handle_func = chatbot_helper.setup.mock.calls[0][0];
    });

    return {
        fs,
        settings,
        chatbot,
        chatbot_helper,
        random,
        quesoqueue,
        handle_func,
    };
};

const build_chatter = function (username, displayName, isSubscriber, isMod, isBroadcaster) {
    return { username, displayName, isSubscriber, isMod, isBroadcaster };
}

test('setup', () => {
    requireIndex();
});

const parseMessage = (line) => {
    const idx = line.indexOf(':');
    var user = line.substring(0, idx).trim();
    var message = line.substring(idx + 1);
    var isBroadcaster = false;
    var isMod = false;
    var isSubscriber = false;
    var username = undefined;
    while (true) {
        if (user.startsWith('~')) {
            isBroadcaster = true;
        } else if (user.startsWith('@')) {
            isMod = true;
        } else if (user.startsWith('%')) {
            isSubscriber = true;
        } else if (user.startsWith('+') || user.startsWith('$')
            || user.startsWith('^') || user.startsWith('*')
            || user.startsWith('!') || user.startsWith('&')
            || user.startsWith('\'') || user.startsWith('?')) {
            // nothing to set
        } else {
            break;
        }
        user = user.substring(1);
    }
    // find username
    while (user.endsWith(')')) {
        const idx = user.lastIndexOf('(');
        const maybeUsername = user.substring(idx + 1, user.length - 1).trim();
        user = user.substring(0, idx).trim();
        if (!isPronoun(maybeUsername)) {
            // found username!
            username = maybeUsername;
        }
    }
    var displayName = user;
    if (username === undefined) {
        username = displayName.toLowerCase();
    }
    expect(username).toBeDefined();
    expect(displayName).toBeDefined();
    let column = message.length;
    message = message.trimStart();
    column -= message.length;
    let trimLen = message.length;
    message = message.trimEnd();
    trimLen -= message.length;
    return {
        message: message.trim(),
        sender: build_chatter(username, displayName, isSubscriber, isMod, isBroadcaster),
        column: idx + 2 + column,
        trimLen: trimLen,
    };
}

const testFiles = fs.readdirSync(path.resolve(__dirname, 'logs')).filter(file => file.endsWith('.test.log'));

for (const file of testFiles) {

    const fileName = path.relative('.', path.resolve(__dirname, `logs/${file}`));
    test(fileName, async () => {
        let test = requireIndex();

        var replyMessageQueue = [];
        var accuracy = 0;

        function pushMessageWithStack(message) {
            let error = new Error("<Stack Trace Capture>");
            Error.captureStackTrace(error, pushMessageWithStack);
            replyMessageQueue.push({ message: message, error: error });
        }

        test.chatbot_helper.say.mockImplementation(pushMessageWithStack);

        const fileStream = fs.createReadStream(fileName);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let errorMessage = (position) => {
            let contents = codeFrameColumns(fs.readFileSync(fileName).toString(), position);
            return '\n\n' + `given in test file ${fileName}:${lineno}` + '\n' + contents;
        }

        var lineno = 0;
        for await (var line of rl) {
            lineno++;
            if (line.trim().startsWith('#') || line.trim().startsWith('//') || !line) {
                continue;
            }
            const idx = line.indexOf(' ');
            const command = idx == -1 ? line : line.substring(0, idx);
            const rest = idx == -1 ? undefined : line.substring(idx + 1);
            let position = () => {
                return {
                    start: { column: idx + 2, line: lineno },
                    end: { column: line.length + 1, line: lineno }
                };
            };
            if (command == 'restart') {
                test = requireIndex(test.fs, test.settings);
                test.chatbot_helper.say.mockImplementation(pushMessageWithStack);
            } else if (command == 'accuracy') {
                accuracy = parseInt(rest);
            } else if (command == 'settings') {
                replaceSettings(test.settings, JSON.parse(rest));
            } else if (command == 'chatters') {
                setChatters(JSON.parse(rest));
            } else if (command == 'queso.save') {
                try {
                    expect(JSON.parse(test.fs.readFileSync(path.resolve(__dirname, '../../queso.save')))).toEqual(JSON.parse(rest));
                } catch (error) {
                    error.message += errorMessage(position());
                    throw error;
                }
            } else if (command == 'seed') {
                const chance = jestChance.getChance(rest);
                test.random
                    .mockImplementation(() => {
                        return chance.random();
                    });
            } else if (command == 'random') {
                test.random
                    .mockImplementationOnce(() => parseFloat(rest));
            } else if (command.startsWith('[') && command.endsWith(']')) {
                await setTime(command.substring(1, command.length - 1), accuracy);
                // const time = new Date();
                const chat = parseMessage(rest);
                position = () => {
                    return {
                        start: { column: idx + 1 + chat.column, line: lineno },
                        end: { column: line.length + 1 - chat.trimLen, line: lineno }
                    };
                };
                // console.log(`${time}`, chat.sender, 'sends', chat.message);
                // console.log("sender", chat.sender.username, "settings", index.settings.username.toLowerCase());
                if (chat.sender.username == test.settings.username.toLowerCase()) {
                    // this is a message by the chat bot, check replyMessageQueue
                    let shift = replyMessageQueue.shift();
                    if (shift === undefined) {
                        try {
                            expect(replyMessageQueue).toContain(chat.message);
                        } catch (error) {
                            error.message += errorMessage(position());
                            throw error;
                        }
                    }
                    try {
                        expect(shift.message).toBe(chat.message);
                    } catch (error) {
                        error.stack = shift.error.stack.replace(shift.error.message, error.message + errorMessage(position()));
                        throw error;
                    }
                } else {
                    try {
                        await test.handle_func(chat.message, chat.sender, test.chatbot_helper.say);
                    } catch (error) {
                        error.message += errorMessage(position());
                        throw error;
                    }
                }
            } else {
                fail(`unexpected line "${line}" in file ${fileName}`);
            }
        }
        // replyMessageQueue should be empty now!
        try {
            expect(replyMessageQueue.map(m => m.message)).toEqual([]);
        } catch (error) {
            let shift = replyMessageQueue.shift();
            error.stack = shift.error.stack.replace(shift.error.message, error.message + '\n\n' + `not given in test file ${fileName}`);
            throw error;
        }
    });
}
