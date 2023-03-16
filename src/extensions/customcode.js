// TODO: move customCodes in here

const resolver = (customCodes) => {
  return {
    description: "custom code",
    resolve(args) {
      if (customCodes.has(args)) {
        return customCodes.getEntry(args);
      }
    },
  };
};

const setup = (extensions) => {
  extensions.registerResolver(
    "customcode",
    resolver(extensions.getCustomCodes())
  );
};

module.exports = {
  setup,
};
