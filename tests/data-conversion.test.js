'use strict';

// imports
const jestChance = require('jest-chance');
const readline = require('readline');
const { fail } = require('assert');
const path = require('path');
const fs = require('fs');
const { Volume } = require('memfs');
const { codeFrameColumns } = require('@babel/code-frame');
const { simRequireIndex, simSetTime, simSetChatters, buildChatter, createMockFs, fetchMock, START_TIME, EMPTY_CHATTERS } = require('./simulation.js');

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

test('test-conversion', () => {
    const mockFs = createMockFs();
    const index = simRequireIndex(mockFs);
});
