/* eslint-disable no-unused-vars */
import { Chatbot } from "../chatbot";

const chatbot_helper = jest.fn((): Chatbot => {
  return {
    client: null, // do not mock client, since it is not used outside
    handle_func: null, // not used outside either
    connect: jest.fn(),
    setup: jest.fn(() => undefined),
    say: jest.fn(() => undefined),
  };
});

export {
  chatbot_helper as helper
};
