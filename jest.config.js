/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  globalSetup: "jest-chance",
  modulePathIgnorePatterns: ["<rootDir>/build"],
  moduleNameMapper: {
    "@twurple/api/lib": "<rootDir>/node_modules/@twurple/api/lib/index",
    "@twurple/auth/lib": "<rootDir>/node_modules/@twurple/auth/lib/index",
  },
};
