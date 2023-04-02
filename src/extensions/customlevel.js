const settings = require("../settings.js");
const { v5: uuidv5 } = require("uuid");

const QUEUE_NAMESPACE = "1e511052-e714-49bb-8564-b60915cf7279"; // this is the namespace for *known* level types for the queue (Version 4 UUID)
const ROMHACK_UUID = uuidv5("ROMhack", QUEUE_NAMESPACE);
const UNCLEARED_UUID = uuidv5("Uncleared", QUEUE_NAMESPACE);

const hasOwn = (object, property) => {
  return Object.prototype.hasOwnProperty.call(object, property);
};

const levelType = (custom) => {
  return {
    display(level) {
      const uuid = level.code;
      if (Object.prototype.hasOwnProperty.call(custom, uuid)) {
        const description = custom[uuid];
        return description.display;
      }
    },
  };
};

const nameResolver = (custom) => {
  return {
    description: "custom level",
    resolve(args) {
      // TODO implementation that is not O(n)
      // TODO prevent custom codes from saving the custom levels as custom codes
      for (const [uuid, value] of Object.entries(custom)) {
        if (value.display.trim().toUpperCase() == args.trim().toUpperCase()) {
          return { type: "customlevel", code: uuid };
        }
      }
      return null;
    },
  };
};

const resolver = (custom) => {
  return {
    description: "custom level",
    resolve(args) {
      // TODO implementation that is not O(n)
      // TODO prevent custom codes from saving the custom levels as custom codes
      for (const [uuid, value] of Object.entries(custom)) {
        if (value.customCodes.map(s => s.toUpperCase()).includes(args.trim().toUpperCase())) {
          return { type: "customlevel", code: uuid };
        }
      }
      return null;
    },
  };
};

const customlevelCommand = (customLevels) => {
  return {
    aliases: ["!customlevel", "!customlevels"],
    async handle(message, sender, respond) {
      if (sender.isBroadcaster) {
        if (message == "") {
          respond(this.customLevels());
        } else {
          // TODO!
        }
      } else {
        respond(this.customLevels());
      }
    },
    customLevels: () => {
      const list = Object.entries(customLevels).flatMap(([, value]) => {
        // translate customLevels into custom code map
        if (value.enabled) {
          return [value.display + " [" + value.customCodes.join(", ") + "]"];
        } else {
          return [];
        }
      });
      if (list.length == 0) {
        return "There are no custom levels configured.";
      } else if (list.length == 1) {
        return "The current custom level is " + list[0] + ".";
      } else if (list.length == 2) {
        return (
          "The current custom levels are " + list[0] + " and " + list[1] + "."
        );
      } else {
        list[list.length - 1] = "and " + list[list.length - 1];
        return "The current custom levels are " + list.join(", ") + ".";
      }
    },
  };
};

const romHackLevel = () => {
  return {
    code: ROMHACK_UUID,
    type: "customlevel",
  };
};

const unclearedLevel = () => {
  return {
    code: UNCLEARED_UUID,
    type: "customlevel",
  };
};

const addRomHack = (custom, enabled = true) => {
  if (hasOwn(custom, ROMHACK_UUID)) {
    const result = custom[ROMHACK_UUID].enabled != enabled;
    custom[ROMHACK_UUID].enabled = enabled;
    return result;
  } else {
    custom[ROMHACK_UUID] = {
      customCodes: ["ROMhack", "R0M-HAK-LVL"],
      display: "a ROMhack",
      enabled,
    };
    return true;
  }
};

const addUncleared = (custom, enabled = true) => {
  if (hasOwn(custom, UNCLEARED_UUID)) {
    const result = custom[UNCLEARED_UUID].enabled != enabled;
    custom[UNCLEARED_UUID].enabled = enabled;
    return result;
  } else {
    custom[UNCLEARED_UUID] = {
      customCodes: ["Uncleared", "UNC-LEA-RED"],
      display: "an uncleared level",
      enabled,
    };
    return true;
  }
};

const removeRomHack = (custom) => {
  if (hasOwn(custom, ROMHACK_UUID)) {
    delete custom[ROMHACK_UUID];
    return true;
  }
  return false;
};

const removeUncleared = (custom) => {
  if (hasOwn(custom, UNCLEARED_UUID)) {
    delete custom[UNCLEARED_UUID];
    return true;
  }
  return false;
};

const isRomHackLevel = (entry) => {
  return entry.type == "customlevel" && entry.code == ROMHACK_UUID;
};

const isUnclearedLevel = (entry) => {
  return entry.type == "customlevel" && entry.code == UNCLEARED_UUID;
};

const queueHandler = (custom) => {
  return {
    upgrade(code) {
      let uuid = null;
      if (code.startsWith("custom:")) {
        uuid = code.substring("custom:".length);
      }
      if (code == "UNC-LEA-RED" || uuid == UNCLEARED_UUID) {
        addUncleared(custom, false);
        return unclearedLevel();
      } else if (code == "R0M-HAK-LVL" || uuid == ROMHACK_UUID) {
        addRomHack(custom, false);
        return romHackLevel();
      } else if (uuid != null) {
        if (!hasOwn(custom, uuid)) {
          custom[uuid] = {
            customCodes: [uuid],
            display: "unknown custom level",
            enabled: false,
          };
        }
        return { code: uuid, type: "customlevel" };
      }
      return null;
    },
    check(allEntries) {
      let queueChanged = false;
      if (
        !settings.romhacks_enabled &&
        allEntries.every((level) => !isRomHackLevel(level))
      ) {
        queueChanged |= removeRomHack(custom);
        console.log(`ROMhack has been removed as a custom level.`);
      } else {
        queueChanged |= addRomHack(custom, !!settings.romhacks_enabled);
        console.log(
          `ROMhack has been added as a custom level (enabled=${!!settings.romhacks_enabled}).`
        );
      }
      if (
        !settings.uncleared_enabled &&
        allEntries.every((level) => !isUnclearedLevel(level))
      ) {
        queueChanged |= removeUncleared(custom);
        console.log(`Uncleared has been removed as a custom level.`);
      } else {
        queueChanged |= addUncleared(custom, !!settings.uncleared_enabled);
        console.log(
          `Uncleared has been added as a custom level (enabled=${!!settings.uncleared_enabled}).`
        );
      }
      return queueChanged;
    },
  };
};

const setup = (extensions) => {
  const custom = extensions.getQueueBinding("customlevel");
  extensions.registerEntryType("customlevel", levelType(custom));
  extensions.registerResolver("customlevel", resolver(custom));
  extensions.registerResolver("customlevel-name", nameResolver(custom));
  extensions.registerCommand("customlevel", customlevelCommand(custom));
  extensions.registerQueueHandler(queueHandler(custom));
};

module.exports = {
  setup,
};
