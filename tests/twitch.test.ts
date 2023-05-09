import { jest } from "@jest/globals";
import {
  asMock,
  buildChatter,
  replace,
  mockTwitchApi,
  createMockVolume,
} from "./simulation.js";
import { Settings } from "../src/settings-type.js";
import { User } from "../src/extensions-api/queue-entry.js";
import * as timers from "timers";
import { createFsFromVolume } from "memfs";

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

async function setupMocks() {
  jest.resetModules();

  const volume = createMockVolume();
  const mockFs = createFsFromVolume(volume);
  jest.mock("fs", () => ({
    __esModule: true, // Use it when dealing with esModules
    ...mockFs,
    default: mockFs,
    toString() {
      return "fs mock";
    },
  }));
  jest.unstable_mockModule("fs", () => ({
    ...mockFs,
    default: mockFs,
    toString() {
      return "fs module mock";
    },
  }));
  (await import("fs")).default;

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

  return { settings, twitch, twitchApi };
}

test("online users", async () => {
  const { settings, twitch, twitchApi } = await setupMocks();

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

test("createOnlineUsers:empty", async () => {
  await setupMocks();
  const { createOnlineUsers } = await import("../src/twitch.js");
  const users: User[] = [];
  const result = createOnlineUsers(users);
  expect(result.users).toEqual(new Map());
  expect(result.names).toEqual(new Map());
  expect(result.displayNames).toEqual(new Map());
  expect(result.getOnlineUser({})).toEqual({ online: false });
  expect(result.getOnlineUser({ id: "0" })).toEqual({ online: false });
  expect(result.getOnlineUser({ name: "a" })).toEqual({ online: false });
  expect(result.getOnlineUser({ displayName: "A" })).toEqual({ online: false });
  expect(result.isOnline({})).toBe(false);
  expect(result.isOnline({ id: "0" })).toBe(false);
  expect(result.isOnline({ name: "a" })).toBe(false);
  expect(result.isOnline({ displayName: "A" })).toBe(false);
});

function createUser(i: number): User {
  return {
    id: i.toString(),
    name: String.fromCharCode("a".charCodeAt(0) + i),
    displayName: String.fromCharCode("A".charCodeAt(0) + i),
  };
}

test("createOnlineUsers:users", async () => {
  await setupMocks();
  const { createOnlineUsers } = await import("../src/twitch.js");
  const users: User[] = Array.from({ length: 25 }, (_, i) => createUser(i));
  const result = createOnlineUsers(users);
  expect(result.users).toEqual(
    new Map(users.map((user) => [user.id, { user, online: true }]))
  );
  expect(result.names).toEqual(
    new Map(users.map((user) => [user.name, user.id]))
  );
  expect(result.displayNames).toEqual(
    new Map(users.map((user) => [user.displayName, user.id]))
  );
  expect(result.getOnlineUser({})).toEqual({ online: false });
  expect(result.getOnlineUser({ id: "0" })).toEqual({
    online: true,
    user: createUser(0),
  });
  expect(result.getOnlineUser({ name: "a" })).toEqual({
    online: true,
    user: createUser(0),
  });
  expect(result.getOnlineUser({ displayName: "A" })).toEqual({
    online: true,
    user: createUser(0),
  });
  expect(result.isOnline({})).toBe(false);
  expect(result.isOnline({ id: "0" })).toBe(true);
  expect(result.isOnline({ name: "a" })).toBe(true);
  expect(result.isOnline({ displayName: "A" })).toBe(true);
  expect(result.isOnline({ id: "24" })).toBe(true);
  expect(result.isOnline({ name: "y" })).toBe(true);
  expect(result.isOnline({ displayName: "Y" })).toBe(true);
  expect(result.isOnline({ id: "25" })).toBe(false);
  expect(result.isOnline({ name: "z" })).toBe(false);
  expect(result.isOnline({ displayName: "Z" })).toBe(false);
  expect(result.getOnlineUser({ id: "25" })).toEqual({ online: false });
  expect(result.getOnlineUser({ name: "z" })).toEqual({ online: false });
  expect(result.getOnlineUser({ displayName: "Z" })).toEqual({ online: false });
});

test("createOnlineUsers:users-with-lurkers", async () => {
  await setupMocks();
  const { createOnlineUsers } = await import("../src/twitch.js");
  const users: User[] = Array.from({ length: 25 }, (_, i) => createUser(i));
  const lurkers = (user: User) => parseInt(user.id) % 3 == 0;
  const filter = (user: User) => !lurkers(user);
  const result = createOnlineUsers(users, filter);
  expect(result.users).toEqual(
    new Map(users.map((user) => [user.id, { user, online: filter(user) }]))
  );
  expect(result.names).toEqual(
    new Map(users.map((user) => [user.name, user.id]))
  );
  expect(result.displayNames).toEqual(
    new Map(users.map((user) => [user.displayName, user.id]))
  );
  expect(result.getOnlineUser({})).toEqual({ online: false });
  expect(result.getOnlineUser({ id: "0" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result.getOnlineUser({ name: "a" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result.getOnlineUser({ displayName: "A" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result.getOnlineUser({ id: "1" })).toEqual({
    online: true,
    user: createUser(1),
  });
  expect(result.getOnlineUser({ name: "b" })).toEqual({
    online: true,
    user: createUser(1),
  });
  expect(result.getOnlineUser({ displayName: "B" })).toEqual({
    online: true,
    user: createUser(1),
  });
  expect(result.isOnline({})).toBe(false);
  expect(result.isOnline({ id: "0" })).toBe(false);
  expect(result.isOnline({ name: "a" })).toBe(false);
  expect(result.isOnline({ displayName: "A" })).toBe(false);
  expect(result.isOnline({ id: "1" })).toBe(true);
  expect(result.isOnline({ name: "b" })).toBe(true);
  expect(result.isOnline({ displayName: "B" })).toBe(true);
  expect(result.isOnline({ id: "23" })).toBe(true);
  expect(result.isOnline({ name: "x" })).toBe(true);
  expect(result.isOnline({ displayName: "X" })).toBe(true);
  expect(result.isOnline({ id: "24" })).toBe(false);
  expect(result.isOnline({ name: "y" })).toBe(false);
  expect(result.isOnline({ displayName: "Y" })).toBe(false);
  expect(result.isOnline({ id: "25" })).toBe(false);
  expect(result.isOnline({ name: "z" })).toBe(false);
  expect(result.isOnline({ displayName: "Z" })).toBe(false);
  expect(result.getOnlineUser({ id: "25" })).toEqual({ online: false });
  expect(result.getOnlineUser({ name: "z" })).toEqual({ online: false });
  expect(result.getOnlineUser({ displayName: "Z" })).toEqual({ online: false });
});

test("createOnlineUsers:users-with-lurkers-and-subscribers", async () => {
  await setupMocks();
  const { createOnlineUsers } = await import("../src/twitch.js");
  const users: User[] = Array.from({ length: 25 }, (_, i) => createUser(i));
  const lurkers = (user: User) => parseInt(user.id) % 3 == 0;
  const filter0 = (user: User) => !lurkers(user);
  const result0 = createOnlineUsers(users, filter0);
  const subscriber = (user: User) => parseInt(user.id) % 2 == 0;
  const filter1 = subscriber;
  const result1 = createOnlineUsers(result0, filter1);
  expect(result1.users).toEqual(
    new Map(
      users.map((user) => [
        user.id,
        { user, online: filter0(user) && filter1(user) },
      ])
    )
  );
  expect(result1.names).toEqual(
    new Map(users.map((user) => [user.name, user.id]))
  );
  expect(result1.displayNames).toEqual(
    new Map(users.map((user) => [user.displayName, user.id]))
  );
  expect(result1.getOnlineUser({})).toEqual({ online: false });
  expect(result1.getOnlineUser({ id: "0" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result1.getOnlineUser({ name: "a" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result1.getOnlineUser({ displayName: "A" })).toEqual({
    online: false,
    user: createUser(0),
  });
  expect(result1.getOnlineUser({ id: "1" })).toEqual({
    online: false,
    user: createUser(1),
  });
  expect(result1.getOnlineUser({ name: "b" })).toEqual({
    online: false,
    user: createUser(1),
  });
  expect(result1.getOnlineUser({ displayName: "B" })).toEqual({
    online: false,
    user: createUser(1),
  });
  expect(result1.getOnlineUser({ id: "4" })).toEqual({
    online: true,
    user: createUser(4),
  });
  expect(result1.getOnlineUser({ name: "e" })).toEqual({
    online: true,
    user: createUser(4),
  });
  expect(result1.getOnlineUser({ displayName: "E" })).toEqual({
    online: true,
    user: createUser(4),
  });
  expect(result1.isOnline({})).toBe(false);
  expect(result1.isOnline({ id: "0" })).toBe(false);
  expect(result1.isOnline({ name: "a" })).toBe(false);
  expect(result1.isOnline({ displayName: "A" })).toBe(false);
  expect(result1.isOnline({ id: "4" })).toBe(true);
  expect(result1.isOnline({ name: "e" })).toBe(true);
  expect(result1.isOnline({ displayName: "E" })).toBe(true);
  expect(result1.isOnline({ id: "22" })).toBe(true);
  expect(result1.isOnline({ name: "w" })).toBe(true);
  expect(result1.isOnline({ displayName: "W" })).toBe(true);
  expect(result1.isOnline({ id: "23" })).toBe(false);
  expect(result1.isOnline({ name: "x" })).toBe(false);
  expect(result1.isOnline({ displayName: "X" })).toBe(false);
  expect(result1.isOnline({ id: "24" })).toBe(false);
  expect(result1.isOnline({ name: "y" })).toBe(false);
  expect(result1.isOnline({ displayName: "Y" })).toBe(false);
  expect(result1.isOnline({ id: "25" })).toBe(false);
  expect(result1.isOnline({ name: "z" })).toBe(false);
  expect(result1.isOnline({ displayName: "Z" })).toBe(false);
  expect(result1.getOnlineUser({ id: "25" })).toEqual({ online: false });
  expect(result1.getOnlineUser({ name: "z" })).toEqual({ online: false });
  expect(result1.getOnlineUser({ displayName: "Z" })).toEqual({
    online: false,
  });
});
