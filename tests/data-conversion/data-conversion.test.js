'use strict';

// imports
const path = require('path');
const fs = require('fs');
const { simRequireIndex, simSetChatters, createMockVolume, fetchMock, START_TIME, EMPTY_CHATTERS } = require('../simulation.js');

// fake timers
jest.useFakeTimers();
// console checks
const consoleWarnMock = jest.spyOn(global.console, 'warn');
const consoleErrorMock = jest.spyOn(global.console, 'error');

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

const copy = (volume, realFs, mockFileName, realFileName) => {
    if (realFs.existsSync(realFileName)) {
        volume.fromJSON({ [mockFileName]: realFs.readFileSync(realFileName, 'utf-8') }, path.resolve('.'));
    }
};

const loadVolume = (testFolder) => {
    let volume = createMockVolume();
    copy(volume, fs, './queso.save', path.resolve(__dirname, `data/${testFolder}/queso.save`));
    copy(volume, fs, './userWaitTime.txt', path.resolve(__dirname, `data/${testFolder}/userWaitTime.txt`));
    copy(volume, fs, './waitingUsers.txt', path.resolve(__dirname, `data/${testFolder}/waitingUsers.txt`));
    return volume;
};

const checkResult = (mockFs, realFs, testFolder) => {
    let queue_real = JSON.parse(mockFs.readFileSync('./data/queue.json'));
    let queue_expect = JSON.parse(realFs.readFileSync(path.resolve(__dirname, `data/${testFolder}/queue.json`)));
    expect(queue_real).toEqual(queue_expect);
};

test('conversion-test-empty', () => {
    const test = 'test-empty';
    const volume = loadVolume(test);
    // empty file system
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors!
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
});

test('conversion-test-1', () => {
    const test = 'test-1';
    const volume = loadVolume(test);
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors, but a warning in the console
    expect(consoleWarnMock).toHaveBeenCalledWith("Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names.");
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
    // no old files have been created
    expect(mockFs.existsSync('./queso.save')).toBe(false);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(false);
});

test('conversion-test-2', () => {
    const test = 'test-2';
    const volume = loadVolume(test);
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors and no exception was thrown
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
    // old files have been deleted
    expect(mockFs.existsSync('./queso.save')).toBe(false);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(false);
});

test('conversion-test-3', () => {
    const test = 'test-3';
    const volume = loadVolume(test);
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors and no exception was thrown
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
    // old files have been deleted
    expect(mockFs.existsSync('./queso.save')).toBe(false);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(false);
});

test('conversion-test-4', () => {
    const test = 'test-4';
    const volume = loadVolume(test);
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors and no exception was thrown
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
    // old files have been deleted
    expect(mockFs.existsSync('./queso.save')).toBe(false);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(false);
});

test('conversion-test-5', () => {
    const test = 'test-5';
    const volume = loadVolume(test);
    const index = simRequireIndex(volume);
    const mockFs = index.fs;
    // should load without errors and no exception was thrown
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
    // old files have been deleted
    expect(mockFs.existsSync('./queso.save')).toBe(false);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(false);
});

test('conversion-test-corrupt-1', () => {
    const test = 'test-corrupt-1';
    const volume = loadVolume(test);
    let mockFs;

    const index = () => {
        try {
            simRequireIndex(volume);
        } catch (err) {
            mockFs = err.simIndex.fs;
            throw err;
        }
    };
    // should error!
    expect(index).toThrow();
    // check file system -> old file still exists -> no loss of data on conversion error!
    expect(mockFs.existsSync('./queso.save')).toBe(true);
});

test('conversion-test-corrupt-2', () => {
    const test = 'test-corrupt-2';
    const volume = loadVolume(test);
    let mockFs;
    
    const index = () => {
        try {
            simRequireIndex(volume);
        } catch (err) {
            mockFs = err.simIndex.fs;
            throw err;
        }
    };
    // should error!
    expect(index).toThrow();
    // check file system -> old files still exists -> no loss of data on conversion error!
    expect(mockFs.existsSync('./queso.save')).toBe(true);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(true);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(true);
});

test('conversion-test-corrupt-3', () => {
    const test = 'test-corrupt-3';
    const volume = loadVolume(test);
    let mockFs;
    
    const index = () => {
        try {
            simRequireIndex(volume);
        } catch (err) {
            mockFs = err.simIndex.fs;
            throw err;
        }
    };
    // should error!
    expect(index).toThrow();
    // check file system -> old files still exists -> no loss of data on conversion error!
    expect(mockFs.existsSync('./queso.save')).toBe(true);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(true);
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(true);
});

test('conversion-test-corrupt-4', () => {
    const test = 'test-corrupt-4';
    const volume = loadVolume(test);
    let mockFs;
    
    const index = () => {
        try {
            simRequireIndex(volume);
        } catch (err) {
            mockFs = err.simIndex.fs;
            throw err;
        }
    };
    // should error!
    expect(index).toThrow();
    // check file system -> old files still exists -> no loss of data on conversion error!
    expect(mockFs.existsSync('./queso.save')).toBe(true);
    expect(mockFs.existsSync('./userWaitTime.txt')).toBe(false); // this file is actually missing on purpose
    expect(mockFs.existsSync('./waitingUsers.txt')).toBe(true);
});
