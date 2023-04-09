/* eslint-disable no-unused-vars */

const chatbot_helper = jest.fn(() => {
  return {
    client: null, // do not mock client, since it is not used outside
    handle_func: null, // not used outside either
    connect: jest.fn(),
    setup: jest.fn(() => undefined),
    say: jest.fn(() => undefined),
  };
});

module.exports = {
  helper: chatbot_helper,
};
