import type { JestConfigWithTsJest } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
  globalSetup: "jest-chance",
  modulePathIgnorePatterns: ["<rootDir>/build"],
  moduleNameMapper: {
    "^\\.\\./src/(.*)\\.js$": "<rootDir>/src/$1",
    "^((\\.){1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  rootDir: ".",
  roots: ["<rootDir>/src/", "<rootDir>/tests/", "<rootDir>"],
  moduleDirectories: ["node_modules", "<rootDir>/src", "<rootDir>/tests"],
};

export default jestConfig;
