import type { JestConfigWithTsJest } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
  globalSetup: "jest-chance",
  modulePathIgnorePatterns: ["<rootDir>/build"],
  moduleNameMapper: {
    "^\\.\\./src/(.*)\\.js$": "<rootDir>/src/$1", // workaround of mocking the ../src/twitch-api.js, and ../src/chatbot.js modules
    "^((\\.){1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tests/tsconfig.json",
      },
    ],
  },
  rootDir: "..",
  roots: ["<rootDir>/src/", "<rootDir>/tests/"],
};

export default jestConfig;
