import { HelixChatChatter } from "@twurple/api";

class TwitchApiMock {
  async setup() {
    // do nothing
  }
  createTmiClient() {
    throw new Error(
      "This should never be called from tests -> Use the chatbot.js mock instead!"
    );
  }
  getChatters = jest.fn(async (): Promise<HelixChatChatter[]> => {
    return [];
  });
}

export { TwitchApiMock as TwitchApi };
export const twitchApi = new TwitchApiMock();
