'use strict';

// imports
const jestChance = require('jest-chance');
const readline = require('readline');
const { fail } = require('assert');
const path = require('path');
const fs = require('fs');
const { codeFrameColumns } = require('@babel/code-frame');
const { simRequireIndex, simSetTime, simSetChatters, buildChatter, replace, flushPromises, clearAllTimers, fetchMock, START_TIME, EMPTY_CHATTERS } = require('../simulation.js');

const isPronoun = (text) => {
    return text == 'Any' || text == 'Other' || text.includes('/');
};

// fake timers
jest.useFakeTimers();

beforeEach(() => {
    // reset fetch
    fetchMock.mockClear();
    simSetChatters(EMPTY_CHATTERS);

    // reset time
    jest.setSystemTime(START_TIME);
});

test('setup', () => {
    simRequireIndex();
});

const parseMessage = (line) => {
    const idx = line.indexOf(':');
    let user = line.substring(0, idx).trim();
    let message = line.substring(idx + 1);
    let isBroadcaster = false;
    let isMod = false;
    let isSubscriber = false;
    let username;
    while (true) {
        if (user.startsWith('~')) {
            isBroadcaster = true;
        } else if (user.startsWith('@')) {
            isMod = true;
        } else if (user.startsWith('%')) {
            isSubscriber = true;
        } else if (user.startsWith('+') || user.startsWith('$') ||
            user.startsWith('^') || user.startsWith('*') ||
            user.startsWith('!') || user.startsWith('&') ||
            user.startsWith('\'') || user.startsWith('?')) {
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
    let displayName = user;
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
        sender: buildChatter(username, displayName, isSubscriber, isMod, isBroadcaster),
        column: idx + 2 + column,
        trimLen: trimLen,
    };
};

const chatLogTest = (fileName) => {
    return async () => {
        let test = simRequireIndex();

        let replyMessageQueue = [];
        let accuracy = 0;

        function pushMessageWithStack(message) {
            let error = new Error("<Stack Trace Capture>");
            Error.captureStackTrace(error, pushMessageWithStack);
            replyMessageQueue.push({ message, error });
        }

        try {
            test.chatbot_helper.say.mockImplementation(pushMessageWithStack);

            const fileStream = fs.createReadStream(fileName);

            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let errorMessage = (position) => {
                let contents = codeFrameColumns(fs.readFileSync(fileName).toString(), position);
                return '\n\n' + `given in test file ${fileName}:${lineno}` + '\n' + contents;
            };

            let lineno = 0;
            for await (let line of rl) {
                lineno++;
                if (line.trim().startsWith('#') || line.trim().startsWith('//') || !line) {
                    continue;
                }
                const idx = line.indexOf(' ');
                const command = idx == -1 ? line : line.substring(0, idx);
                const rest = idx == -1 ? undefined : line.substring(idx + 1);
                let position = {
                    start: { column: idx + 2, line: lineno },
                    end: { column: line.length + 1, line: lineno }
                };
                if (command == 'restart') {
                    test = simRequireIndex(test.volume, test.settings, new Date());
                    test.chatbot_helper.say.mockImplementation(pushMessageWithStack);
                } else if (command == 'accuracy') {
                    accuracy = parseInt(rest);
                } else if (command == 'settings') {
                    // TODO: ideally new settings would be written to settings.json
                    //       and settings.js could be reloaded instead to validate settings
                    replace(test.settings, JSON.parse(rest));
                } else if (command == 'chatters') {
                    simSetChatters(JSON.parse(rest));
                } else if (command.startsWith('queue.json')) {
                    try {
                        const memberIdx = command.indexOf('/');
                        let jsonData = JSON.parse(test.fs.readFileSync(path.resolve(__dirname, '../../data/queue.json')));
                        if (memberIdx != -1) {
                            const member = command.substring(memberIdx + 1);
                            jsonData = jsonData[member];
                        }
                        expect(jsonData).toEqual(JSON.parse(rest));
                    } catch (error) {
                        error.message += errorMessage(position);
                        throw error;
                    }
                } else if (command.startsWith('customCodes')) {
                    try {
                        const memberIdx = command.indexOf('/');
                        let jsonData = JSON.parse(test.fs.readFileSync(path.resolve(__dirname, '../../customCodes.json')));
                        if (memberIdx != -1) {
                            const member = command.substring(memberIdx + 1);
                            jsonData = jsonData[member];
                        }
                        expect(jsonData).toEqual(JSON.parse(rest));
                    } catch (error) {
                        error.message += errorMessage(position());
                        throw error;
                    }
                } else if (command.startsWith('save')) {
                    const fileName = command.substring(command.indexOf(':') + 1);
                    test.fs.writeFileSync(path.resolve(__dirname, '../..', fileName), rest);
                } else if (command == 'seed') {
                    const chance = jestChance.getChance(rest);
                    test.random
                        .mockImplementation(() => {
                            return chance.random();
                        });
                } else if (command == 'flushPromises') {
                    await flushPromises();
                } else if (command == 'random') {
                    test.random
                        .mockImplementationOnce(() => parseFloat(rest));
                } else if (command == 'fs-fail') {
                    jest.spyOn(test.fs, rest).mockImplementationOnce(() => { throw new Error('fail on purpose in test'); });
                } else if (command.startsWith('[') && command.endsWith(']')) {
                    await simSetTime(command.substring(1, command.length - 1), accuracy);
                    // const time = new Date();
                    const chat = parseMessage(rest);
                    position = {
                        start: { column: idx + 1 + chat.column, line: lineno },
                        end: { column: line.length + 1 - chat.trimLen, line: lineno }
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
                                error.message += errorMessage(position);
                                throw error;
                            }
                        }
                        try {
                            expect(shift.message).toBe(chat.message);
                        } catch (error) {
                            error.stack = shift.error.stack.replace(shift.error.message, error.message + errorMessage(position));
                            throw error;
                        }
                    } else {
                        try {
                            await test.handle_func(chat.message, chat.sender, test.chatbot_helper.say);
                        } catch (error) {
                            error.message += errorMessage(position);
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

        } finally {
            await clearAllTimers();
        }
    };
};

const testFiles = fs.readdirSync(path.resolve(__dirname, 'logs')).filter(file => file.endsWith('.test.log'));

for (const file of testFiles) {
    const fileName = path.relative('.', path.resolve(__dirname, `logs/${file}`));
    test(fileName, chatLogTest(fileName));
}
