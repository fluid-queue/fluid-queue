"use strict";

const path = require("path");
const fs = require("fs");
const settings = require("./settings.js");
const aliasManagement = require("./aliases.js");
const aliases = aliasManagement.aliases();

const fileEnding = ".js";
const AsyncFunction = (async () => {}).constructor;

const defaultActivated = [
  "smm2",
  "customcode",
  "customlevel",
  // "smm1",
  "smm2-lenient",
  "customlevel-name",
];

const loadFiles = (directory) => {
  const result = {};
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(fileEnding));
  for (const file of files) {
    const filePath = path.join(directory, file);
    const name = file.slice(0, -fileEnding.length);
    const module = require(filePath);
    result[name] = module;
  }
  return result;
};

const resolvers = {
  available: {},
  activatedOrder: [],
  activatedSet: new Set(),
  get api() {
    return {
      registerResolver: (name, resolver) => {
        if (
          !("resolve" in resolver && typeof resolver.resolve === "function")
        ) {
          throw new Error(`Resolver ${name} does not have a resolve function`);
        }
        this.register(name, resolver);
      },
    };
  },
  load() {
    // load settings
    if (settings.resolvers != null) {
      this.activatedOrder = settings.resolvers;
    } else {
      this.activatedOrder = defaultActivated;
    }
    this.activatedOrder = this.activatedOrder.filter(
      (activated) => activated in this.available
    );
    this.activatedOrder.forEach((activated) =>
      this.activatedSet.add(activated)
    );
    console.log(`Resolvers: [${this.activatedOrder.join(", ")}]`);
  },
  register(name, resolver) {
    this.available[name] = resolver;
  },
  get(name) {
    if (name in this.available && this.activatedSet.has(name)) {
      return this.available[name];
    }
    return null;
  },
  *[Symbol.iterator]() {
    for (const name of this.activatedOrder) {
      if (name in this.available) {
        yield this.available[name];
      }
    }
  },
};

const getMajorVersion = (version) => {
  version = version.trim();
  const index = version.indexOf(".");
  if (index == -1) {
    return parseInt(version);
  }
  return parseInt(version.substring(0, index));
};

const checkVersion = (currentVersion, newVersion, name = null) => {
  if (currentVersion == null || newVersion == null) {
    throw new Error(
      `version missing in the save file` +
        (name == null ? "" : ` for extension ${name}`)
    );
  }
  const currentMajorVersion = getMajorVersion(currentVersion);
  const newMajorVersion = getMajorVersion(newVersion);
  if (newMajorVersion > currentMajorVersion) {
    throw new Error(
      `version ${newVersion} in the save file is not compatible with current version ${currentVersion}` +
        (name == null ? "" : ` for extension ${name}`)
    );
  }
  // version is compatible for now
};

const bindings = {
  objectBindings: {},
  saveHandler: null,
  get api() {
    return {
      getQueueBinding: (name, version = "1.0") => {
        return this.getObjectBinding(name, version);
      },
    };
  },
  save(name) {
    if (this.saveHandler == null) {
      console.warn(
        `extension ${name} requested to save, but no save handler is registered`
      );
      return;
    }
    this.saveHandler(name);
  },
  setSaveHandler(saveHandler) {
    this.saveHandler = saveHandler;
  },
  emptyObjectBinding(name, version = "1.0") {
    return { data: {}, version, save: () => this.save(name) };
  },
  ensureObjectBinding(name, version = "1.0") {
    if (!(name in this.objectBindings)) {
      this.objectBindings[name] = this.emptyObjectBinding(name, version);
    }
  },
  getObjectBinding(name, version = "1.0") {
    this.ensureObjectBinding(name, version);
    return this.objectBindings[name];
  },
  overrideObjectBinding(name, newValue) {
    if (name in this.objectBindings) {
      checkVersion(this.objectBindings[name].version, newValue.version, name);
    }
    this.ensureObjectBinding(name, newValue.version);
    const binding = this.objectBindings[name];
    const oldValue = { ...binding };
    Object.keys(binding).forEach((key) => {
      delete binding[key];
    });
    Object.assign(binding, newValue);
    binding.save = () => this.save(name);
    return oldValue;
  },
  overrideObjectBindings(newBindings) {
    // clear all bindings
    // this is needed to keep all bindings even if newBindings does not contain an existing binding
    Object.entries(this.objectBindings).forEach(
      ([name, value]) =>
        this.overrideObjectBinding(
          name,
          this.emptyObjectBinding(name, value.version)
        ) // keep version
    );
    // set new values
    Object.entries(newBindings).forEach(([name, newValue]) =>
      this.overrideObjectBinding(name, newValue)
    );
  },
  getObjectBindings() {
    return this.objectBindings;
  },
};

const commands = {
  handlers: {},
  get api() {
    return {
      registerCommand: (name, handler) => {
        if (
          !(
            "handle" in handler &&
            typeof handler.handle === "function" &&
            handler.handle.constructor === AsyncFunction
          )
        ) {
          throw new Error(
            `Command handler ${name} does not have an async handle function`
          );
        }
        if (!("aliases" in handler && Array.isArray(handler.aliases))) {
          throw new Error(
            `Command handler ${name} does not have an aliases array`
          );
        }
        this.register(name, handler);
      },
    };
  },
  register(name, handler) {
    this.handlers[name] = handler;
    aliases.addDefault(name, handler.aliases);
  },
  get_remainder(x) {
    var index = x.indexOf(" ");
    if (index == -1) {
      return "";
    }
    return x.substr(index + 1);
  },
  async handle(message, sender, respond) {
    for (const name in this.handlers) {
      if (aliases.isAlias(name, message)) {
        const handler = this.handlers[name];
        return await handler.handle(
          this.get_remainder(message),
          sender,
          respond
        );
      }
    }
  },
};

const queueHandlers = {
  handlers: [],
  get api() {
    return {
      registerQueueHandler: this.register.bind(this),
    };
  },
  register(handler) {
    this.handlers.push(handler);
  },
  upgrade(allEntries) {
    let changed = false;
    for (const entry of allEntries) {
      if (!("type" in entry)) {
        // upgrade entry
        for (const handler of this.handlers) {
          if ("upgrade" in handler && typeof handler.upgrade === "function") {
            const result = handler.upgrade(entry.code);
            if (result != null) {
              Object.entries(result).forEach(
                ([name, value]) => (entry[name] = value)
              );
              changed = true;
              break;
            }
          }
        }
      }
    }
    return changed;
  },
  check(allEntries) {
    let changed = false;
    for (const handler of this.handlers) {
      if ("check" in handler && typeof handler.check === "function") {
        changed |= handler.check(allEntries);
      }
    }
    return changed;
  },
};

/**
 * @typedef {object} queueEntry
 * @property {string} [type] - The type of the queue entry. This should have been set after the entry has been resolved.
 * @property {string} code - The level code.
 * @property {string} [submitter] - The display name of the user who submitted the queue entry. This is only set if the entry was added to the queue.
 * @property {string} [username] - The username of the user who submitted the queue entry. This is only set if the entry was added to the queue.
 */

/**
 * @typedef {object} resolveResult
 * @property {?queueEntry} entry - A queue entry if it could be resolved.
 * @property {?string} description - A description of what kind of queue entry was resolved. This is only set whenever entry is set.
 * @property {[string]} descriptions - A list of descriptions what kind of queue entries could not be resolved. This is only set whenerver entry is not set.
 */

const extensions = {
  resolvers,
  bindings,
  commands,
  queueHandlers,
  entryTypes: {},
  extensions: [],
  /**
   * @type {extensionsApi}
   */
  get api() {
    return {
      ...this.resolvers.api,
      ...this.bindings.api,
      ...this.commands.api,
      ...this.queueHandlers.api,
      registerEntryType: this.registerEntryType.bind(this),
      resolve: this.resolve.bind(this),
      display: this.display.bind(this),
    };
  },

  overrideQueueBindings(bindings) {
    return this.bindings.overrideObjectBindings(bindings);
  },
  getQueueBindings() {
    return this.bindings.getObjectBindings();
  },
  setQueueBindingSaveHandler(saveHandler) {
    if (typeof saveHandler !== "function") {
      throw new Error("Save handler is not a function");
    }
    return this.bindings.setSaveHandler(saveHandler);
  },
  async handleCommands(message, sender, respond) {
    return await this.commands.handle(message, sender, respond);
  },
  upgradeEntries(allEntries) {
    return this.queueHandlers.upgrade(allEntries);
  },
  checkEntries(allEntries) {
    return this.queueHandlers.check(allEntries);
  },
  /**
   * loads extensions
   */
  load() {
    // load extensions
    const extensionsPath = path.resolve(__dirname, "extensions");
    this.extensions = loadFiles(extensionsPath);
    // setup extensions
    Object.entries(this.extensions).forEach(([name, extension]) => {
      if ("setup" in extension && typeof extension.setup === "function") {
        // setup function will get an api object instead of the extensions object directly
        // such that only those functions can be called that are meant to be exposed to the extension
        extension.setup(this.api);
      } else {
        console.warn(`Extension ${name} does not have a setup function`);
      }
    });
    console.log(`Extensions: [${Object.keys(this.extensions).join(", ")}]`);
    // load resolvers
    this.resolvers.load();
  },
  registerEntryType(name, entryType) {
    if (!("display" in entryType && typeof entryType.display === "function")) {
      throw new Error(`Entry type ${name} does not have a display function`);
    }
    this.entryTypes[name] = entryType;
  },
  get availableResolvers() {
    return this.activated
      .filter((name) => name in this.available)
      .map((name) => this.available[name])
      .filter((resolver) => resolver != null);
  },
  displayFallback(entry) {
    // try to fallback to code
    const code = entry.code;
    if (code == null) {
      // can not display queue entry
      console.error("Can not display queue entry: %s", JSON.stringify(entry));
      return (
        "unknown entry" + (entry.type == null ? "" : ` of type ${entry.type}`)
      );
    }
    return code;
  },
  /**
   * @param {queueEntry} entry - The queue entry to be displayed.
   * @returns {string} a string representation of how the queue entry should be displayed in chat.
   */
  display(entry) {
    const type = entry.type;
    if (type != null && type in this.entryTypes) {
      const entryType = this.entryTypes[type];
      return entryType.display(entry);
    }
    return this.displayFallback(entry);
  },
  /**
   * Resolving a level code to a queue entry or null.
   * If the user input starts with a resolver name followed by a space, then only that specific resolver is used.
   * Otherwise all resolvers are run in order until a queue entry is found.
   *
   * @method
   * @param {string} levelCode User input of a level code, can contain spaces.
   * @returns {resolveResult} a resolve result or null if it could not be resolved.
   */
  resolve(levelCode) {
    const descriptions = new Set();
    // check if levelCode start with a resolver name
    let [resolverName, ...resolverArgs] = levelCode.trim().split(/\s+/);
    const resolver = this.resolvers.get(resolverName);
    if (resolver != null) {
      const entry = resolver.resolve(resolverArgs.join(" "));
      return {
        entry,
        description: entry == null ? null : resolver.description,
        descriptions:
          entry == null && resolver.description != null
            ? [resolver.description]
            : [],
      };
    }
    resolverArgs = [resolverName, ...resolverArgs];
    // run all resolvers in order until first one resolves otherwise
    for (const resolver of this.resolvers) {
      const entry = resolver.resolve(resolverArgs.join(" "));
      if (entry != null) {
        return {
          entry,
          description: resolver.description,
          descriptions: [],
        };
      }
      if (resolver.description != null) {
        descriptions.add(resolver.description);
      }
    }
    return {
      entry: null,
      description: null,
      descriptions: [...descriptions],
    };
  },
};

/**
 * @typedef {Object} extensionsApi
 * @property {typeof extensions.display} display
 * @property {typeof extensions.resolve} resolve
 */

module.exports = extensions;
