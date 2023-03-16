const levelType = {
  display(level) {
    return level.code;
  },
};

const resolver = {
  description: "smm1 level code",
  resolve() {
    // TODO
    return null;
  },
};

const setup = (extensions) => {
  extensions.registerEntryType("smm1", levelType);
  extensions.registerResolver("smm1", resolver);
};

module.exports = {
  setup,
};
