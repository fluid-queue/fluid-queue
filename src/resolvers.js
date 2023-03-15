"use strict";

const path = require("path");
const fs = require("fs");
const settings = require("./settings.js");

const defaultActivated = [
  "smm2",
  "customcode",
  "customlevel",
  "smm2-regex",
  "smm1",
];

const fileEnding = ".js";
const loadFiles = (path) => {
  const result = {};
  const files = fs
    .readdirSync(path)
    .filter((file) => file.endsWith(fileEnding));
  for (const file of files) {
    const filePath = path.join(path, file);
    const name = file.slice(0, -fileEnding.length);
    const module = require(filePath);
    result[name] = module;
  }
  return result;
};

const resolvers = {
  types: {},
  available: {},
  activated: [],
  /**
   * loads resolvers and settings
   */
  load() {
    // load types
    const typesPath = path.resolve(__dirname, "types");
    this.types = loadFiles(typesPath);
    // load resolvers
    const resolversPath = path.resolve(__dirname, "resolvers");
    this.available = loadFiles(resolversPath);
    // load settings
    if (settings.resolvers != null) {
      this.activated = settings.resolvers;
    } else {
      this.activated = defaultActivated;
    }
  },
  get resolvers() {
    return this.activated
      .filter((name) => name in this.available)
      .map((name) => this.available[name])
      .filter((resolver) => resolver != null);
  },
  /**
   * resolve the arguments of a command to a level code and level type
   */
  resolveArguments(string) {
    const resolve = (resolver, string, types) => {
      if (resolver != null) {
        if (
          resolver.resolveArguments != null &&
          typeof resolver.resolveArguments === "function"
        ) {
          const result = resolver.resolveArguments(string);
          if (result != null && result.type != null && result.code != null) {
            // check if type exists
            if (result.type in types) {
              return result;
            }
          }
        }
      }
      return null;
    };
    // check if args start with a resolver name
    let [resolverName, ...args] = string.trim().split(/\s+/);
    if (
      resolverName in this.available &&
      this.activated.includes(resolverName)
    ) {
      const resolver = this.activated[resolverName];
      const result = resolve(resolver, args.join(""), this.types);
      if (result != null) {
        return result;
      }
    }
    // run all resolvers in order until first one resolves otherwise
    args = [resolverName, ...args];
    for (const resolver of this.resolvers) {
      const result = resolve(resolver, args.join(""), this.types);
      if (result != null) {
        return result;
      }
    }
    return null;
  },
};

resolvers.load();

module.exports = {
  resolvers,
};
