import { jest } from "@jest/globals";
import { asMock, buildChatter, replace, mockTwitchApi } from "./simulation.js";
import { Settings } from "../src/settings-type.js";
import { User } from "../src/extensions-api/queue-entry.js";
import * as timers from "timers";

// constants
const defaultTestChatters: User[] = [];
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
let mockChatters: User[] = [];

// fake timers
jest.useFakeTimers();

const setChatters = (newChatters: User[]) => {
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

  // mock needed for ttlcache
  jest.spyOn(global.performance, "now").mockImplementation(() => {
    let result;
    if (typeof global.performance.timeOrigin === "number") {
      const origin = Math.floor(global.performance.timeOrigin);
      result = Math.max(new Date().getTime() - origin, 0);
    } else {
      result = new Date().getTime();
    }
    return result;
  });

  // mocks
  const twitchApi = (await mockTwitchApi()).twitchApi;

  const twitch = (await import("../src/twitch.js")).twitch;

  // mock chatters
  asMock(twitchApi.getChatters).mockImplementation(() =>
    Promise.resolve(mockChatters)
  );
  jest.unstable_mockModule("../src/settings", () => {
    return { default: {} };
  });
  const settings = (await import("../src/settings.js")).default;
  replace(settings, Settings.parse(defaultTestSettings));

  if (settings === undefined || twitch === undefined) {
    expect(settings).not.toBeUndefined();
    expect(twitch).not.toBeUndefined();
    throw new Error("unreachable");
  }

  expect(settings.channel).toBe("queso_queue_test_channel");

  // online users should be empty
  let onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()]).toEqual([]);
  expect([...onlineUsers.names.keys()]).toEqual([]);
  expect([...onlineUsers.displayNames.keys()]).toEqual([]);
  expect(onlineUsers.isOnline({})).toBe(false);
  expect(onlineUsers.isOnline({ id: '${user("liquidnya").id}' })).toBe(false);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(false);
  expect(onlineUsers.isOnline({ displayName: "liquidnya" })).toBe(false);

  // change chatters mock and compare with result
  setChatters([
    {
      id: '${user("liquidnya").id}',
      name: "liquidnya",
      displayName: "liquidnya",
    },
    {
      id: '${user("furretwalkbot").id}',
      name: "furretwalkbot",
      displayName: "FurretWalkBot",
    },
  ]);
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    ['${user("liquidnya").id}', '${user("furretwalkbot").id}'].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(false);

  jest.setSystemTime(new Date("2022-04-21T00:00:00Z"));
  await new Promise(jest.requireActual<typeof timers>("timers").setImmediate);
  // notice chatter
  twitch.noticeChatter(
    buildChatter("helperblock", "helperblock", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    [
      '${user("liquidnya").id}',
      '${user("furretwalkbot").id}',
      '${user("helperblock").id}',
    ].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot", "helperblock"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot", "helperblock"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(true);

  // after 4 minutes still online!
  jest.setSystemTime(new Date("2022-04-21T00:04:00Z"));
  await new Promise(jest.requireActual<typeof timers>("timers").setImmediate);
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    [
      '${user("liquidnya").id}',
      '${user("furretwalkbot").id}',
      '${user("helperblock").id}',
    ].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot", "helperblock"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot", "helperblock"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(true);

  // after 5 minutes not online any longer
  jest.setSystemTime(new Date("2022-04-21T00:05:00Z"));
  await new Promise(jest.requireActual<typeof timers>("timers").setImmediate);
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    ['${user("liquidnya").id}', '${user("furretwalkbot").id}'].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(false);

  // test the lurking feature
  twitch.setToLurk(
    buildChatter("furretwalkbot", "FurretWalkBot", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  // note that FurretWalkBot is in the list, even though they are lurking
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    ['${user("liquidnya").id}', '${user("furretwalkbot").id}'].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot"].sort()
  );
  // ...but the online status of FurretWalkBot is offline!
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(false);
  expect(onlineUsers.getOnlineUser({ name: "furretwalkbot" }).online).toBe(
    false
  );
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(false);
  // even when they still chat, they are not online
  twitch.noticeChatter(
    buildChatter("furretwalkbot", "FurretWalkBot", false, true, false)
  );
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    ['${user("liquidnya").id}', '${user("furretwalkbot").id}'].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(false);
  expect(onlineUsers.getOnlineUser({ name: "furretwalkbot" }).online).toBe(
    false
  );
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(false);

  // unlurk makes them online again!
  twitch.notLurkingAnymore({ name: "furretwalkbot" });
  onlineUsers = await twitch.getOnlineUsers();
  expect([...onlineUsers.users.keys()].sort()).toEqual(
    ['${user("liquidnya").id}', '${user("furretwalkbot").id}'].sort()
  );
  expect([...onlineUsers.names.keys()].sort()).toEqual(
    ["liquidnya", "furretwalkbot"].sort()
  );
  expect([...onlineUsers.displayNames.keys()].sort()).toEqual(
    ["liquidnya", "FurretWalkBot"].sort()
  );
  expect(onlineUsers.isOnline({ name: "furretwalkbot" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "liquidnya" })).toBe(true);
  expect(onlineUsers.isOnline({ name: "helperblock" })).toBe(false);

  // the twitch api has been called 8 times
  expect(asMock(twitchApi.getChatters).mock.calls.length).toBe(8);
});
