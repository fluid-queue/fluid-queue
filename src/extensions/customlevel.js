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

const resolver = {
  description: "custom level",
  resolve() {
    // TODO implement
    // TODO prevent custom codes from saving the custom levels as custom codes
    return null;
  },
};

const nameResolver = {
  description: "custom level",
  resolve() {
    // TODO implement
    // TODO prevent custom codes from saving the custom levels as custom codes
    return null;
  },
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

const setup = (extensions) => {
  const custom = extensions.getQueueBinding("customlevel");
  extensions.registerEntryType("customlevel", levelType(custom));
  extensions.registerResolver("customlevel", resolver);
  extensions.registerResolver("customlevel-name", nameResolver);
  extensions.registerCommand("customlevel", customlevelCommand(custom));
};

module.exports = {
  setup,
};
