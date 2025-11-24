import { vi, beforeEach, test, expect } from "vitest";
import {
  buildChatter,
  mockTwitchApi,
  createMockVolume,
  simAdvanceTime,
  simSetChatters,
} from "./simulation.js";
import type { User } from "fluid-queue/extensions-api/queue-entry.js";
import { vol } from "memfs";
import path from "node:path";

// constants
const defaultTestChatters: User[] = [];
const defaultTestSettings = {
  channel: "queso_queue_test_channel",
  clientId: "",
  clientSecret: "",
  max_size: 50,
  level_timeout: "10 minutes",
  level_selection: [
    "next",
    "subnext",
    "modnext",
    "random",
    "subrandom",
    "modrandom",
  ],
  message_cooldown: "5 seconds",
};

beforeEach(() => {
  vi.useFakeTimers();

  // reset chatters
  simSetChatters(defaultTestChatters);

  // reset time
  vi.setSystemTime(new Date("2022-04-21T00:00:00Z"));
});

async function setupMocks() {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.mock("node:fs", () =>
    import("memfs")
      .then((memfs) => memfs.fs)
      .then((fs) => ({ ...fs, default: fs }))
  );
  vi.mock("node:fs/promises", () =>
    import("memfs")
      .then((memfs) => memfs.fs.promises)
      .then((promises) => ({ ...promises, default: promises }))
  );

  const volume = await createMockVolume(defaultTestSettings);
  // setup virtual file system
  vol.reset();
  vol.fromJSON(volume.toJSON(), path.resolve("."));

  const settings = (await import("fluid-queue/settings.js")).default;

  // mocks
  const twitchApi = (await mockTwitchApi()).twitchApi;

  const twitch = (await import("fluid-queue/twitch.js")).twitch;

  return { settings, twitch, twitchApi };
}

test("online users", async () => {
  const { settings, twitch, twitchApi } = await setupMocks();

  expect(settings).not.toBeUndefined();
  expect(twitch).not.toBeUndefined();

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
  simSetChatters([
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
  await simAdvanceTime(4 * 60_000, 1000);
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
  await simAdvanceTime(5 * 60_000);

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
  expect(vi.mocked(twitchApi["getChatters"]).mock.calls.length).toBe(8);
});

test("createOnlineUsers:empty", async () => {
  await setupMocks();
  const { createOnlineUsers } = await import("fluid-queue/twitch.js");
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
  const { createOnlineUsers } = await import("fluid-queue/twitch.js");
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
  const { createOnlineUsers } = await import("fluid-queue/twitch.js");
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
  const { createOnlineUsers } = await import("fluid-queue/twitch.js");
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
