const settings = require("../settings.js");
const { v5: uuidv5, v4: uuidv4, validate: uuidValidate } = require("uuid");

const QUEUE_NAMESPACE = "1e511052-e714-49bb-8564-b60915cf7279"; // this is the namespace for *known* level types for the queue (Version 4 UUID)
const ROMHACK_UUID = uuidv5("ROMhack", QUEUE_NAMESPACE);
const UNCLEARED_UUID = uuidv5("Uncleared", QUEUE_NAMESPACE);

if (ROMHACK_UUID == null || UNCLEARED_UUID == null) {
  throw new Error("Error creating uuids for ROMhack and uncleared levels.");
}

const hasOwn = (object, property) => {
  return Object.prototype.hasOwnProperty.call(object, property);
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

const isRomHackLevel = (entry) => {
  return entry.type == "customlevel" && entry.code == ROMHACK_UUID;
};

const isUnclearedLevel = (entry) => {
  return entry.type == "customlevel" && entry.code == UNCLEARED_UUID;
};

const levelType = (custom) => {
  return {
    display(level) {
      const uuid = level.code;
      if (custom.has(uuid)) {
        const description = custom.get(uuid);
        return description.name;
      } else {
        const name = `unknown custom level (${uuid})`;
        custom.add(uuid, {
          codes: [uuid],
          name,
          enabled: false,
        });
        return name;
      }
    },
  };
};

const initCustom = (binding) => {
  return {
    binding,
    get cache() {
      if (this.binding.cache === undefined) {
        // this is happening everytime the queue is loaded or reloaded
        this.binding.cache = {};
        this.binding.cache.codes = new Map();
        this.binding.cache.names = new Map();
        Object.entries(this.binding.data).forEach(([uuid, value]) => {
          this.binding.cache.names.set(value.name.trim().toUpperCase(), uuid);
          value.codes.forEach((code) => {
            this.binding.cache.codes.set(code.trim().toUpperCase(), uuid);
          });
        });
      }
      return this.binding.cache;
    },
    fromName(name) {
      return this.cache.names.get(name.trim().toUpperCase());
    },
    fromCode(code) {
      return this.cache.codes.get(code.trim().toUpperCase());
    },
    fromArguments(args) {
      const fromCode = this.fromCode(args);
      if (fromCode != null) {
        return fromCode;
      }
      const fromName = this.fromName(args);
      if (fromName != null) {
        return fromName;
      }
      return null;
    },
    get(uuid) {
      return this.binding.data[uuid];
    },
    has(uuid) {
      return hasOwn(this.binding.data, uuid);
    },
    remove(uuid) {
      if (this.has(uuid)) {
        const value = this.get(uuid);
        this.cache.names.delete(value.name.trim().toUpperCase());
        value.codes.forEach((code) => {
          this.cache.codes.delete(code.trim().toUpperCase());
        });
        this.binding.data[uuid] = undefined;
        delete this.binding.data[uuid];
        return true;
      }
      return false;
    },
    add(uuid, value) {
      if (this.has(uuid)) {
        this.remove(uuid);
      }
      this.binding.data[uuid] = value;
      this.cache.names.set(value.name.trim().toUpperCase(), uuid);
      value.codes.forEach((code) => {
        this.cache.codes.set(code.trim().toUpperCase(), uuid);
      });
    },
    list(admin) {
      return Object.entries(this.binding.data).flatMap(([, value]) => {
        // translate customLevels into custom code map
        if (value.enabled || admin) {
          return (
            [value.name + " [" + value.codes.join(", ") + "]"] +
            (admin ? " (" + (value.enabled ? "enabled" : "disabled") + ")" : "")
          );
        } else {
          return [];
        }
      });
    },
    addRomHack(enabled = true) {
      if (this.has(ROMHACK_UUID)) {
        const value = this.get(ROMHACK_UUID);
        this.remove(ROMHACK_UUID);
        const result = value.enabled != enabled;
        value.enabled = enabled;
        this.add(ROMHACK_UUID, value);
        return result;
      } else {
        this.add(ROMHACK_UUID, {
          codes: ["ROMhack", "R0M-HAK-LVL"],
          name: "a ROMhack",
          enabled,
        });
        return true;
      }
    },
    addUncleared(enabled = true) {
      if (this.has(UNCLEARED_UUID)) {
        const value = this.get(UNCLEARED_UUID);
        this.remove(UNCLEARED_UUID);
        const result = value.enabled != enabled;
        value.enabled = enabled;
        this.add(UNCLEARED_UUID, value);
        return result;
      } else {
        this.add(UNCLEARED_UUID, {
          codes: ["Uncleared", "UNC-LEA-RED"],
          name: "an uncleared level",
          enabled,
        });
        return true;
      }
    },
    removeRomHack() {
      return this.remove(ROMHACK_UUID);
    },
    removeUncleared() {
      return this.remove(UNCLEARED_UUID);
    },
    save() {
      this.binding.save();
    },
  };
};

const nameResolver = (custom) => {
  return {
    description: "custom level",
    resolve(args) {
      // TODO prevent custom codes from saving the custom levels as custom codes
      const uuid = custom.fromName(args);
      if (uuid != null && custom.get(uuid).enabled) {
        return { type: "customlevel", code: uuid };
      }
      return null;
    },
  };
};

const resolver = (custom) => {
  return {
    description: "custom level",
    resolve(args) {
      // TODO prevent custom codes from saving the custom levels as custom codes
      const uuid = custom.fromCode(args);
      if (uuid != null && custom.get(uuid).enabled) {
        return { type: "customlevel", code: uuid };
      }
      return null;
    },
  };
};

const customlevelCommand = (custom) => {
  return {
    aliases: ["!customlevel", "!customlevels"],
    syntax:
      "The correct syntax is !customlevel {remove/enable/disable/export} {code/levelName...}, !customlevel add {code} {levelName...}, !customlevel code add {code} {code/levelName...}, !customlevel code remove {code}, !customlevel import {json}.",
    async handle(message, sender, respond) {
      if (sender.isBroadcaster) {
        if (message == "") {
          respond(this.customLevels(true));
        } else {
          let [command, ...rest] = message.trim().split(" ");
          command = command.toLowerCase();
          if (command == "code" && rest.length >= 2) {
            let [subcommand, code, ...codeOrName] = rest;
            if (subcommand == "add" && codeOrName.length >= 1) {
              codeOrName = codeOrName.join(" ");
              const fromCode = custom.fromCode(code);
              if (fromCode != null) {
                respond(
                  `The custom level with the code ${code} already exists with the name "${
                    custom.get(fromCode).name
                  }" and codes ${custom.get(fromCode).codes.join(", ")}.`
                );
                return;
              }
              const fromArguments = custom.fromArguments(codeOrName);
              if (fromArguments != null) {
                const value = custom.get(fromArguments);
                value.codes.push(code);
                custom.add(fromArguments, value);
                custom.save();
                respond(
                  `Added the code ${code} to the custom level with the name "${
                    value.name
                  }" and codes ${value.codes.join(", ")}.`
                );
                return;
              }
              respond(`Custom level "${codeOrName}" not found.`);
              return;
            } else if (subcommand == "remove") {
              const fromCode = custom.fromCode(code);
              if (fromCode != null) {
                const value = custom.get(fromCode);
                const newCodes = value.codes.filter(
                  (c) => c.toUpperCase() != code.trim().toUpperCase()
                );
                if (newCodes.length == 0) {
                  respond(
                    `Can not remove the code ${code} from the custom level with the name "${
                      custom.get(fromCode).name
                    }" and codes ${custom
                      .get(fromCode)
                      .codes.join(", ")}, since it is the only code left.`
                  );
                  return;
                }
                custom.remove(fromCode);
                value.codes = newCodes;
                custom.add(fromCode, value);
                custom.save();
                respond(
                  `Removed the code ${code} to the custom level with the name "${
                    value.name
                  }" and codes ${value.codes.join(", ")}.`
                );
                return;
              }
              respond(`Custom level with code "${code}" not found.`);
              return;
            } else {
              respond(`Invalid arguments. ${this.syntax}`);
              return;
            }
          } else if (
            (command == "enable" || command == "disable") &&
            rest.length >= 1
          ) {
            const codeOrName = rest.join(" ");
            const fromArguments = custom.fromArguments(codeOrName);
            if (fromArguments != null) {
              const value = custom.get(fromArguments);
              value.enabled = command == "enable";
              custom.add(fromArguments, value);
              custom.save();
              respond(
                (command == "enable" ? "Enabled" : "Disabled") +
                  ` the custom level with the name "${
                    value.name
                  }" and codes ${value.codes.join(", ")}.`
              );
              return;
            }
            respond(`Custom level "${codeOrName}" not found.`);
            return;
          } else if (command == "remove" && rest.length >= 1) {
            const codeOrName = rest.join(" ");
            const fromArguments = custom.fromArguments(codeOrName);
            if (fromArguments != null) {
              const value = custom.get(fromArguments);
              custom.remove(fromArguments);
              custom.save();
              respond(
                `Removed the custom level with the name "${
                  value.name
                }" and codes ${value.codes.join(", ")}.`
              );
              return;
            }
            respond(`Custom level "${codeOrName}" not found.`);
            return;
          } else if (command == "export" && rest.length >= 1) {
            const codeOrName = rest.join(" ");
            const fromArguments = custom.fromArguments(codeOrName);
            if (fromArguments != null) {
              const value = custom.get(fromArguments);
              respond(
                JSON.stringify([fromArguments, value.name, ...value.codes])
              );
              return;
            }
            respond(`Custom level "${codeOrName}" not found.`);
            return;
          } else if (command == "add" && rest.length >= 2) {
            let [code, ...levelName] = rest;
            levelName = levelName.join(" ");
            const fromName = custom.fromArguments(levelName);
            if (fromName != null) {
              respond(
                `The custom level with the name "${
                  custom.get(fromName).name
                }" already exists with codes ${custom
                  .get(fromName)
                  .codes.join(", ")}.`
              );
              return;
            }
            const fromCode = custom.fromArguments(code);
            if (fromCode != null) {
              respond(
                `The custom level with the code ${code} already exists with the name "${
                  custom.get(fromCode).name
                }" and codes ${custom.get(fromCode).codes.join(", ")}.`
              );
              return;
            }
            // new entry!
            const uuid = uuidv4();
            if (custom.has(uuid)) {
              // very very unlikely
              respond(
                "Internal error while creating the custom level. Please try again!"
              );
              return;
            }
            custom.add(uuid, {
              codes: [code],
              name: levelName,
              enabled: true,
            });
            custom.save();
            respond(`Created custom level "${levelName}" with code ${code}.`);
            return;
          } else if (command == "import" && rest.length >= 1) {
            console.log(
              "codes:" + JSON.stringify(Object.fromEntries(custom.cache.codes))
            );
            console.log(
              "names:" + JSON.stringify(Object.fromEntries(custom.cache.names))
            );
            const json = rest.join(" ");
            const userData = JSON.parse(json);
            // validate user data
            if (
              !Array.isArray(userData) ||
              userData.length < 3 ||
              !userData.every((data) => typeof data === "string") ||
              !uuidValidate(userData[0])
            ) {
              respond(`Invalid data.`);
              return;
            }
            const [uuid, levelName, ...codes] = userData;
            const fromName = custom.fromArguments(levelName);
            if (fromName != null) {
              respond(
                `The custom level with the name "${
                  custom.get(fromName).name
                }" already exists with codes ${custom
                  .get(fromName)
                  .codes.join(", ")}.`
              );
              return;
            }
            for (const code of codes) {
              const fromCode = custom.fromArguments(code);
              if (fromCode != null) {
                respond(
                  `The custom level with the code ${code} already exists with the name "${
                    custom.get(fromCode).name
                  }" and codes ${custom.get(fromCode).codes.join(", ")}.`
                );
                return;
              }
            }
            if (custom.has(uuid)) {
              respond(
                `The custom level with the uuid ${uuid} already exists with the name "${
                  custom.get(uuid).name
                }" and codes ${custom.get(uuid).codes.join(", ")}.`
              );
              return;
            }
            custom.add(uuid, {
              codes: codes,
              name: levelName,
              enabled: true,
            });
            custom.save();
            respond(
              `Created custom level "${levelName}" with codes ${codes.join(
                ", "
              )}.`
            );
            return;
          } else {
            respond(`Invalid arguments. ${this.syntax}`);
            return;
          }
        }
      } else {
        respond(this.customLevels());
      }
    },
    customLevels: (admin = false) => {
      const list = custom.list(admin);
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

const queueHandler = (custom) => {
  return {
    upgrade(code) {
      let uuid = null;
      if (code.startsWith("custom:")) {
        uuid = code.substring("custom:".length);
      }
      if (code == "UNC-LEA-RED" || uuid == UNCLEARED_UUID) {
        custom.addUncleared(false);
        return unclearedLevel();
      } else if (code == "R0M-HAK-LVL" || uuid == ROMHACK_UUID) {
        custom.addRomHack(false);
        return romHackLevel();
      } else if (uuid != null) {
        if (!custom.has(uuid)) {
          custom.add(uuid, {
            codes: [uuid],
            name: `unknown custom level (${uuid})`,
            enabled: false,
          });
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
        queueChanged |= custom.removeRomHack();
        console.log(`ROMhack has been removed as a custom level.`);
      } else {
        queueChanged |= custom.addRomHack(!!settings.romhacks_enabled);
        console.log(
          `ROMhack has been added as a custom level (enabled=${!!settings.romhacks_enabled}).`
        );
      }
      if (
        !settings.uncleared_enabled &&
        allEntries.every((level) => !isUnclearedLevel(level))
      ) {
        queueChanged |= custom.removeUncleared();
        console.log(`Uncleared has been removed as a custom level.`);
      } else {
        queueChanged |= custom.addUncleared(!!settings.uncleared_enabled);
        console.log(
          `Uncleared has been added as a custom level (enabled=${!!settings.uncleared_enabled}).`
        );
      }
      allEntries
        .filter((entry) => entry.type == "customlevel")
        .filter((entry) => !custom.has(entry.code))
        .forEach((entry) => {
          custom.add(entry.code, {
            codes: [entry.code],
            name: `unknown custom level (${entry.code})`,
            enabled: false,
          });
        });
      return queueChanged;
    },
  };
};

const setup = (extensions) => {
  const binding = extensions.getQueueBinding("customlevel", "1.0");
  const custom = initCustom(binding);
  extensions.registerEntryType("customlevel", levelType(custom));
  extensions.registerResolver("customlevel", resolver(custom));
  extensions.registerResolver("customlevel-name", nameResolver(custom));
  extensions.registerCommand("customlevel", customlevelCommand(custom));
  extensions.registerQueueHandler(queueHandler(custom));
};

module.exports = {
  setup,
};
