class TwitchApiMock {
  async setup() {
    // do nothing
  }
  createTmiClient() {
    throw new Error(
      "This should never be called from tests -> Use the chatbot.js mock instead!"
    );
  }
  getChatters = jest.fn(async () => {
    return [];
  });
}

module.exports = {
  TwitchApi: TwitchApiMock,
  twitchApi: new TwitchApiMock(),
};
