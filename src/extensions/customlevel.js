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
    // TODO
    return null;
  },
};

const nameResolver = {
  description: "custom level",
  resolve() {
    // TODO
    return null;
  },
};

const setup = (extensions) => {
  const custom = extensions.getQueueBinding("customlevel");
  extensions.registerEntryType("customlevel", levelType(custom));
  extensions.registerResolver("customlevel", resolver);
  extensions.registerResolver("customlevel-name", nameResolver);
};

module.exports = {
  setup,
};
