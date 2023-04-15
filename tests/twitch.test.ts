import { jest } from "@jest/globals";
import { asMock, buildChatter, replace, mockTwitchApi } from "./simulation.js";
import { HelixChatChatter } from "@twurple/api";
import { ChatChatter } from "../src/twitch-api.js";
import { Settings } from "../src/settings.js";

// constants
const defaultTestChatters: HelixChatChatter[] = [];
const defaultTestSettings = {
  channel: "queso_queue_test_channel",
  clientId: "",
  clientSecret: "",
  max_size: 50,
  level_timeout: 10,
  level_selection: [
    "next",
    "subnext",
    "modnext",
    "random",
    "subrandom",
    "modrandom",
  ],
  message_cooldown: 5,
};

// mock variables
let mockChatters: ChatChatter[] = [];

// fake timers
jest.useFakeTimers();

const setChatters = (newChatters: ChatChatter[]) => {
  mockChatters = newChatters;
};

beforeEach(() => {
  // reset chatters
  setChatters(defaultTestChatters);

  // reset time
  jest.setSystemTime(new Date("2022-04-21T00:00:00Z"));
});

test("online users", async () => {
  jest.resetModules();
  // mocks
  const twitchApi = (await mockTwitchApi()).twitchApi;

  const twitch = (await import("../src/twitch.js")).twitch;
  const settings = (await import("../src/settings.js")).default;

  // mock chatters
  asMock(twitchApi.getChatters).mockImplementation(() =>
    Promise.resolve(mockChatters)
  );
  jest.mock("../src/settings", () => {
    return { default: {} };
  });
  replace(settings, Settings.parse(defaultTestSettings));

  if (settings === undefined || twitch === undefined) {
    expect(settings).not.toBeUndefined();
    expect(twitch).not.toBeUndefined();
    throw new Error("unreachable");
  }

  expect(settings.channel).toBe("queso_queue_test_channel");

  // online users should be empty
  let onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set());
  expect(onlineUsers.login).toEqual(new Set());
  expect(onlineUsers.hasSubmitter({})).toBe(false);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(false);

  // change chatters mock and compare with result
  setChatters([
    { userId: "test/1", userName: "liquidnya", userDisplayName: "liquidnya" },
    {
      userId: "test/2",
      userName: "furretwalkbot",
      userDisplayName: "FurretWalkBot",
    },
  ]);
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1", "test/2"]));
  expect(onlineUsers.login).toEqual(new Set(["liquidnya", "furretwalkbot"]));
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(false);

  jest.setSystemTime(new Date("2022-04-21T00:00:00Z"));
  // notice chatter
  twitch.noticeChatter(
    buildChatter("helperblock", "helperblock", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1", "test/2"])); // no id for helperblock yet
  expect(onlineUsers.login).toEqual(
    new Set(["liquidnya", "furretwalkbot", "helperblock"])
  );
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(true);

  // after 4 minutes still online!
  jest.setSystemTime(new Date("2022-04-21T00:04:00Z"));
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1", "test/2"])); // no id for helperblock yet
  expect(onlineUsers.login).toEqual(
    new Set(["liquidnya", "furretwalkbot", "helperblock"])
  );
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(true);

  // after 5 minutes not online any longer
  jest.setSystemTime(new Date("2022-04-21T00:05:00Z"));
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1", "test/2"]));
  expect(onlineUsers.login).toEqual(new Set(["liquidnya", "furretwalkbot"]));
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(false);

  // test the lurking feature
  twitch.setToLurk(
    buildChatter("furretwalkbot", "FurretWalkBot", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1"]));
  expect(onlineUsers.login).toEqual(new Set(["liquidnya"]));
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(false);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(false);
  // even when they still chat, they are not online
  twitch.noticeChatter(
    buildChatter("furretwalkbot", "FurretWalkBot", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1"]));
  expect(onlineUsers.login).toEqual(new Set(["liquidnya"]));
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(false);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(false);

  // unlurk makes them online again!
  twitch.notLurkingAnymore("furretwalkbot");
  onlineUsers = await twitch.getOnlineUsers();
  expect(onlineUsers.submitters).not.toEqual([]);
  // expect(onlineUsers.id).toEqual(new Set(["test/1", "test/2"]));
  expect(onlineUsers.login).toEqual(new Set(["liquidnya", "furretwalkbot"]));
  expect(onlineUsers.hasSubmitter({ login: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "liquidnya" })).toBe(true);
  expect(onlineUsers.hasSubmitter({ login: "helperblock" })).toBe(false);

  // the twitch api has been called 8 times
  expect(asMock(twitchApi.getChatters).mock.calls.length).toBe(8);
});
