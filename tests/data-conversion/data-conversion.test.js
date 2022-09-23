'use strict';

// imports
const jestChance = require('jest-chance');
const readline = require('readline');
const { fail } = require('assert');
const path = require('path');
const fs = require('fs');
const { Volume } = require('memfs');
const { codeFrameColumns } = require('@babel/code-frame');
const { simRequireIndex, simSetTime, simSetChatters, buildChatter, createMockFs, fetchMock, START_TIME, EMPTY_CHATTERS } = require('../simulation.js');

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

const copy = (mockFs, realFs, mockFileName, realFileName) => {
    if (realFs.existsSync(realFileName)) {
        mockFs.writeFileSync(mockFileName, realFs.readFileSync(realFileName));
    }
};

const loadFileSystem = (testFolder) => {
    let mockFs = createMockFs();
    copy(mockFs, fs, './queso.save', path.resolve(__dirname, `data/${testFolder}/queso.save`));
    copy(mockFs, fs, './userWaitTime.txt', path.resolve(__dirname, `data/${testFolder}/userWaitTime.txt`));
    copy(mockFs, fs, './waitingUsers.txt', path.resolve(__dirname, `data/${testFolder}/waitingUsers.txt`));
    return mockFs;
};

const loadFileSystemV2 = (testFolder, version = '2.0') => {
    let mockFs = createMockFs();
    mockFs.mkdirSync('./data');
    copy(mockFs, fs, './data/queue.json', path.resolve(__dirname, `data/${testFolder}/queue-v${version}.json`));
    return mockFs;
};

const checkResult = (mockFs, realFs, testFolder, version = undefined) => {
    let queue_real = JSON.parse(mockFs.readFileSync('./data/queue.json'));
    let queue_expect;
    if (version === undefined) {
        queue_expect = JSON.parse(realFs.readFileSync(path.resolve(__dirname, `data/${testFolder}/queue.json`)));
    } else {
        queue_expect = JSON.parse(realFs.readFileSync(path.resolve(__dirname, `data/${testFolder}/queue-v${version}.json`)));
    }
    expect(queue_real).toEqual(queue_expect);
};

test('conversion-test-empty', () => {
    const test = 'test-empty';
    let mockFs = loadFileSystem(test);
    // empty file system
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
    // should load without errors!
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    checkResult(mockFs, fs, test);
});

test('conversion-test-1', () => {
    const test = 'test-1';
    let mockFs = loadFileSystem(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
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
    let mockFs = loadFileSystem(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
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
    let mockFs = loadFileSystem(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
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
    let mockFs = loadFileSystem(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
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
    let mockFs = loadFileSystem(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
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
    let mockFs = loadFileSystem(test);
    
    const index = () => {
        try {
            simRequireIndex(mockFs);
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
    let mockFs = loadFileSystem(test);
    
    const index = () => {
        try {
            simRequireIndex(mockFs);
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
    let mockFs = loadFileSystem(test);
    
    const index = () => {
        try {
            simRequireIndex(mockFs);
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
    let mockFs = loadFileSystem(test);
    
    const index = () => {
        try {
            simRequireIndex(mockFs);
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

test('conversion-test-v2.0-to-v2.1', () => {
    const test = 'test-v2.0-to-v2.1';
    let mockFs = loadFileSystemV2(test);
    const index = simRequireIndex(mockFs);
    mockFs = index.fs;
    // should load without errors and no exception was thrown
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
    // still the same save file
    checkResult(mockFs, fs, test, '2.0');
    // after first save it will be changed
    index.quesoqueue.save();
    checkResult(mockFs, fs, test, '2.1');
});
