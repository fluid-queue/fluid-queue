const settings = require("../settings.js");
// TODO: move persistence functionality into extensions API
const persistence = require("../persistence.js");

const customCodes = {
  map: new Map(),
  has: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.has(customCode.toUpperCase());
  },
  getEntry: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.get(customCode.toUpperCase()).entry;
  },
  getName: (customCodeArg) => {
    const customCode = customCodeArg.trim();
    return customCodes.map.get(customCode.toUpperCase()).customCode;
  },
  listNames: () => {
    return [...customCodes.map.values()].map((e) => e.customCode);
  },
  set: (customCodeArg, entry) => {
    const customCode = customCodeArg.trim();
    customCodes.map.set(customCode.toUpperCase(), { customCode, entry });
  },
  delete: (customCodeArg) => {
    let result = true;
    const customCode = customCodeArg.trim();
    customCodes.map.delete(customCode.toUpperCase());
    return result;
  },
  reload: () => {
    /* does nothing at the start, but will be overriden by customCodes.fromObject */
  },
  fromObject: (customCodesObject) => {
    customCodes.reload = () => {
      customCodes.fromObject(customCodesObject);
    };
    const entries = Object.entries(customCodesObject).map(
      ([customCode, entry]) => [customCode.toUpperCase(), { customCode, entry }]
    );
    customCodes.map = new Map(entries);
  },
  toObject: () => {
    return Object.fromEntries(
      [...customCodes.map.values()].map((e) => [e.customCode, e.entry])
    );
  },
};

const resolver = {
  description: "custom code",
  resolve(args) {
    if (customCodes.has(args)) {
      return customCodes.getEntry(args);
    }
  },
};

const commandHandler = (resolveLevel, displayLevel) => {
  return {
    aliases: ["!customcode", "!customcodes"],
    async handle(message, sender, respond) {
      if (sender.isBroadcaster) {
        if (message == "") {
          respond(this.customCodes());
        } else {
          respond(await this.customCodeManagement(message));
        }
      } else {
        respond(this.customCodes());
      }
    },
    customCodes() {
      const list = customCodes.listNames();
      if (list.length == 0) {
        return "There are no custom codes set.";
      } else {
        const response = list.join(", ");
        return "The current custom codes are: " + response + ".";
      }
    },
    customCodeManagement(/** @type {string}*/ codeArguments) {
      const save = (/** @type {string} */ errorMessage) => {
        persistence.saveCustomCodesSync(
          { data: customCodes.toObject() },
          errorMessage
        );
      };
      let [command, ...rest] = codeArguments.split(" ");
      if (command == "add" && rest.length >= 2) {
        const [customName, ...realName] = rest;
        const resolved = resolveLevel(realName.join(" "));
        if (resolved.entry == null) {
          return "That is an invalid level code.";
        }

        if (customCodes.has(customName)) {
          const existingName = customCodes.getName(customName);
          return `The custom code ${existingName} already exists`;
        }
        customCodes.set(customName, resolved.entry);
        save("An error occurred while trying to add your custom code.");
        return `Your custom code ${customName} for ${displayLevel(
          resolved.entry
        )} has been added.`;
      } else if (command == "remove" && rest.length == 1) {
        const [customName] = rest;
        if (!customCodes.has(customName)) {
          return `The custom code ${customName} could not be found.`;
        }
        const deletedName = customCodes.getName(customName);
        const deletedEntry = customCodes.getEntry(customName);

        if (!customCodes.delete(customName)) {
          save("An error occurred while trying to remove that custom code.");
          return `The custom code ${deletedName} for ${displayLevel(
            deletedEntry
          )} could not be deleted.`;
        }
        save("An error occurred while trying to remove that custom code.");
        return `The custom code ${deletedName} for ${displayLevel(
          deletedEntry
        )} has been removed.`;
      } else if (
        (command == "load" || command == "reload" || command == "restore") &&
        rest.length == 0
      ) {
        this.loadCustomCodes();
        return "Reloaded custom codes from disk.";
      } else {
        return "Invalid arguments. The correct syntax is !customcode {add/remove/load} {customCode} {ID}.";
      }
    },
    loadCustomCodes() {
      // Check if custom codes are enabled and, if so, validate that the correct files exist.
      if (settings.custom_codes_enabled) {
        const customCodesObject = persistence.loadCustomCodesSync().data;
        customCodes.fromObject(customCodesObject);
      } else {
        // only custom levels will function
        customCodes.fromObject({});
      }
    },
  };
};

/**
 * @param {import('../extensions.js').extensionsApi} extensionsApi
 */
const setup = (extensionsApi) => {
  extensionsApi.registerResolver("customcode", resolver);
  const handler = commandHandler(
    (code) => extensionsApi.resolve(code),
    (level) => extensionsApi.display(level)
  );
  extensionsApi.registerCommand("customcode", handler);
  handler.loadCustomCodes();
};

module.exports = {
  setup,
};
