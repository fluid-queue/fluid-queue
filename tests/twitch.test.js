'use strict';

const { replace, buildChatter } = require('./simulation.js');

// constants
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

// mock variables
var mockChatters;

// mocks
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

const setChatters = (newChatters) => {
    // automatically create a correct chatters object
    if (!Object.hasOwnProperty.call(newChatters, 'chatters')) {
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

test('online users', async () => {
    let twitch;
    let settings;
    jest.isolateModules(() => {
        // setup settings mock
        jest.mock('../settings.js', () => { return {}; });

        // import settings and replace them
        settings = require('../settings.js');
        replace(settings, defaultTestSettings);

        // import twitch.js
        twitch = require('../twitch.js').twitch();
    });

    expect(settings.channel).toBe('queso_queue_test_channel');

    // online users should be empty
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set([]));

    // change chatters mock and compare with result
    setChatters({ broadcaster: ['liquidnya'], vips: ['redzebra_'], moderators: ['helperblock'], staff: [], admins: [], global_mods: [], viewers: [] });
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    jest.setSystemTime(new Date('2022-04-21T00:00:00Z'));
    // notice chatter
    twitch.noticeChatter(buildChatter('furretwalkbot', 'FurretWalkBot', false, true, false));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_', 'furretwalkbot']));

    // after 4 minutes still online!
    jest.setSystemTime(new Date('2022-04-21T00:04:00Z'));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_', 'furretwalkbot']));

    // after 5 minutes not online any longer
    jest.setSystemTime(new Date('2022-04-21T00:05:00Z'));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    // test the lurking feature
    twitch.setToLurk('helperblock');
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'redzebra_']));
    // even when they still chat, they are not online
    twitch.noticeChatter(buildChatter('helperblock', 'helperblock', false, true, false));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'redzebra_']));

    // unlurk makes them online again!
    twitch.notLurkingAnymore('helperblock');
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    // the twitch api has been called 8 times
    expect(fetch.mock.calls.length).toBe(8);

});
