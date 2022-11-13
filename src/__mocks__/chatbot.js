
const chatbot_helper = jest.fn(
  (username, password, channel) => {
    return {
      client: null, // do not mock client, since it is not used outside
      connect: jest.fn(),
      setup: jest.fn(handle_func => undefined),
      say: jest.fn(message => undefined)
    };
  }
);

module.exports = {
  helper: chatbot_helper,
};
