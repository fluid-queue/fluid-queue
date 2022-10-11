'use strict';

// imports
const path = require('path');
const fs = require('fs');
const { simAdvanceTime, simRequireIndex, buildChatter, simSetChatters, createMockVolume, newLevel, fetchMock, START_TIME, EMPTY_CHATTERS, DEFAULT_TEST_SETTINGS } = require('./simulation.js');

// console checks
const consoleWarnMock = jest.spyOn(global.console, 'warn');
const consoleErrorMock = jest.spyOn(global.console, 'error');

jest.useFakeTimers();

beforeEach(() => {
    // reset fetch
    fetchMock.mockClear();
    simSetChatters(EMPTY_CHATTERS);

    // reset time
    jest.setSystemTime(START_TIME);

    // reset console
    consoleWarnMock.mockClear();
    consoleErrorMock.mockClear();

});
test('weight test', async () => {

    const volume = createMockVolume();
    const index = simRequireIndex(volume, DEFAULT_TEST_SETTINGS, START_TIME);
    const queue = index.quesoqueue;
    const twitch = index.twitch;

    let list;
    list = await queue.weightedList();
    expect(list.totalWeight).toBe(0);
    expect(list.offlineLength).toBe(0);
    expect(list.entries).toHaveLength(0);

    const testUser1 = buildChatter('test_user_1', 'にゃん', false, false, false);
    const testUser2 = buildChatter('test_user_2', 'にゃ', false, false, false);
    const testUser3 = buildChatter('test_user_3', 'みゃ', false, false, false);

    const level1 = newLevel('D36-010-5YF', testUser1);
    const level2 = newLevel('MY2-H2M-DSG', testUser2);
    const level3 = newLevel('GBJ-6QY-P8G', testUser3);

    let added;
    added = queue.add(level1);
    expect(added).toContain('has been added to the queue');
    added = queue.add(level2);
    expect(added).toContain('has been added to the queue');
    added = queue.add(level3);
    expect(added).toContain('has been added to the queue');

    // no one is online yet!
    list = await queue.weightedList();
    expect(list.totalWeight).toBe(0);
    expect(list.offlineLength).toBe(3);
    expect(list.entries).toHaveLength(0);

    // user 2 is now online
    twitch.noticeChatter(testUser2);

    list = await queue.weightedList();
    expect(list.totalWeight).toBe(1);
    expect(list.offlineLength).toBe(2);
    expect(list.entries).toHaveLength(1);
    let entry;
    entry = list.entries[0];
    expect(entry.level).toBe(level2);
    // position is 0 even though its oflline position is 1 (index), but it is position 0 for the online position
    expect(entry.position).toBe(0);
    expect(entry.weight()).toBe(1);

    // keep user 2 online
    simSetChatters({ viewers: [testUser2.username] });

    // let time pass! 10 minutes
    await simAdvanceTime(10 * 60 * 1000, 60 * 1000);

    // now user 1 is online too
    twitch.noticeChatter(testUser1);

    list = await queue.weightedList();
    expect(list.totalWeight).toBe(12); // total weight is now 12
    expect(list.offlineLength).toBe(1);
    expect(list.entries).toHaveLength(2);
    entry = list.entries[0];
    expect(entry.level).toBe(level2);
    expect(entry.position).toBe(1); // level 1 was submitted before level 2
    expect(entry.weight()).toBe(11); // gained +10 weight
    entry = list.entries[1];
    expect(entry.level).toBe(level1);
    expect(entry.position).toBe(0); // level 1 was submitted before level 2
    expect(entry.weight()).toBe(1);

});
