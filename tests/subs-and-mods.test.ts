import { jest } from "@jest/globals";
import {
  simAdvanceTime,
  simRequireIndex,
  buildChatter,
  simSetChatters,
  createMockVolume,
  START_TIME,
  EMPTY_CHATTERS,
  DEFAULT_TEST_SETTINGS,
  simSetSubscribers,
  simSetModerators,
} from "./simulation.js";
import { Queue, QueueDataMap, OnlineOfflineList } from "fluid-queue/queue.js";
import {
  EventSubChannelSubscriptionEvent,
  EventSubChannelSubscriptionEndEvent,
  EventSubChannelModeratorEvent,
} from "@twurple/eventsub-base";
import { QueueSubmitter } from "fluid-queue/extensions-api/queue-entry.js";

// Set up the fake timers
jest.useFakeTimers();

// Basic pre-setup stolen from weight.test.ts
const setupMocks = () => {
  // reset chatters
  simSetChatters(EMPTY_CHATTERS);

  // reset time
  jest.setSystemTime(START_TIME);
};

beforeEach(setupMocks);

async function setupQueue() {
  const volume = createMockVolume();
  const index = await simRequireIndex(
    volume,
    DEFAULT_TEST_SETTINGS,
    START_TIME,
    setupMocks
  );
  const twitch = index.twitch;
  const queue: Queue = index.quesoqueue;
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  const getList: QueueDataMap<OnlineOfflineList> = await queue.list();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
    expect(list.offline).toHaveLength(0);
  });

  const chatter1 = buildChatter("chatter1", "chatter1", false, false, false);
  const chatter2 = buildChatter("chatter2", "chatter2", false, false, false);
  const chatter3 = buildChatter(
    "chatter3",
    "chatter3",
    false,
    false,
    false,
    "chatter3"
  );

  const level1 = "D36-010-5YF";
  const level2 = "MY2-H2M-DSG";
  const level3 = "GBJ-6QY-P8G";

  expect(queue.add(level1, chatter1)).toContain("has been added to the queue");
  expect(queue.add(level2, chatter2)).toContain("has been added to the queue");
  expect(queue.add(level3, chatter3)).toContain("has been added to the queue");

  return {
    queue,
    chatter1,
    chatter2,
    chatter3,
    twitch,
  };
}

test("fetch subs", async () => {
  const { queue, chatter1, chatter2, chatter3 } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  // Add a subscriber to the "backend"
  simSetSubscribers([chatter1]);

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);

  // Ensure there are no subs yet
  let getList: QueueDataMap<OnlineOfflineList> = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });

  // Wait 15 minutes, check for chatter1 as a sub
  await simAdvanceTime(15 * 60 * 1000);

  // Ensure our sub is now online
  getList = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatter1.id);
  });
});

test("fetch mods", async () => {
  const { queue, chatter1, chatter2, chatter3 } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  // Add a moderator to the "backend"
  simSetModerators([chatter2]);

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);

  // Ensure there are no mods yet
  let getList: QueueDataMap<OnlineOfflineList> = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });

  // Wait 15 minutes, check for chatter2 as a mod
  await simAdvanceTime(15 * 60 * 1000);

  // Ensure our mod is now online
  getList = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatter2.id);
  });
});

test("send eventsub for new sub", async () => {
  const { queue, chatter1, chatter2, chatter3, twitch } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  jest.mock("@twurple/api");
  jest.mock("@twurple/auth");
  const { ApiClient } = await import("@twurple/api");
  const { StaticAuthProvider } = await import("@twurple/auth");

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);

  // Ensure there are no subs yet
  let getList: QueueDataMap<OnlineOfflineList> = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });

  // Send an eventsub message to promote a chatter
  const event = new EventSubChannelSubscriptionEvent(
    {
      user_id: chatter3.id,
      user_login: chatter3.name,
      user_name: chatter3.displayName,
      broadcaster_user_id: "",
      broadcaster_user_login: "",
      broadcaster_user_name: "",
      tier: "1000",
      is_gift: false,
    },
    jest.mocked(
      new ApiClient({
        authProvider: jest.mocked(new StaticAuthProvider("", "")),
      })
    )
  );
  twitch.handleSub(event);

  // Ensure our new sub is now online
  getList = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    // Set up a QueueSubmitter because that's the type actually *in* the list
    // Comparing the chatter directly here fails, since the list still has isSubscriber = false
    const chatterSubmitter: QueueSubmitter = chatter3;
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatterSubmitter.id);
  });
});

test("send eventsub for ended sub", async () => {
  const { queue, chatter1, chatter2, chatter3, twitch } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  jest.mock("@twurple/api");
  jest.mock("@twurple/auth");
  const { ApiClient } = await import("@twurple/api");
  const { StaticAuthProvider } = await import("@twurple/auth");

  // Make chatter 3 a sub
  chatter3.isSubscriber = true;

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);
  // And notice chatter3
  twitch.noticeChatter(chatter3);

  // Ensure chatter3 is a sub
  let getList: QueueDataMap<OnlineOfflineList> = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatter3.id);
  });

  // Send an eventsub message to demote chatter3
  const event = new EventSubChannelSubscriptionEndEvent(
    {
      user_id: chatter3.id,
      user_login: chatter3.name,
      user_name: chatter3.displayName,
      broadcaster_user_id: "",
      broadcaster_user_login: "",
      broadcaster_user_name: "",
      tier: "1000",
      is_gift: false,
    },
    jest.mocked(
      new ApiClient({
        authProvider: jest.mocked(new StaticAuthProvider("", "")),
      })
    )
  );
  twitch.handleUnsub(event);

  // Ensure our list is now empty
  getList = await queue.sublist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });
});

test("send eventsub for new mod", async () => {
  const { queue, chatter1, chatter2, chatter3, twitch } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  jest.mock("@twurple/api");
  jest.mock("@twurple/auth");
  const { ApiClient } = await import("@twurple/api");
  const { StaticAuthProvider } = await import("@twurple/auth");

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);

  // Ensure there are no mods yet
  let getList: QueueDataMap<OnlineOfflineList> = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });

  // Send an eventsub message to promote a chatter
  const event = new EventSubChannelModeratorEvent(
    {
      user_id: chatter3.id,
      user_login: chatter3.name,
      user_name: chatter3.displayName,
      broadcaster_user_id: "",
      broadcaster_user_login: "",
      broadcaster_user_name: "",
    },
    jest.mocked(
      new ApiClient({
        authProvider: jest.mocked(new StaticAuthProvider("", "")),
      })
    )
  );
  twitch.handleMod(event);

  // Ensure our new mod is now online
  getList = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    // Set up a QueueSubmitter because that's the type actually *in* the list
    // Comparing the chatter directly here fails, since the list still has isSubscriber = false
    const chatterSubmitter: QueueSubmitter = chatter3;
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatterSubmitter.id);
  });
});

test("send eventsub for demoted mod", async () => {
  const { queue, chatter1, chatter2, chatter3, twitch } = await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  jest.mock("@twurple/api");
  jest.mock("@twurple/auth");
  const { ApiClient } = await import("@twurple/api");
  const { StaticAuthProvider } = await import("@twurple/auth");

  // Make chatter 3 a mod
  chatter3.isMod = true;

  // Add our mock users to chat
  simSetChatters([chatter1, chatter2, chatter3]);
  // And notice chatter3
  twitch.noticeChatter(chatter3);

  // Ensure chatter3 is a mod
  let getList: QueueDataMap<OnlineOfflineList> = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(1);
    expect(list.online.at(0)?.submitter.id).toEqual(chatter3.id);
  });

  // Send an eventsub message to demote chatter3
  // (this event is the same as promotion, just sent to a different handler)
  const event = new EventSubChannelModeratorEvent(
    {
      user_id: chatter3.id,
      user_login: chatter3.name,
      user_name: chatter3.displayName,
      broadcaster_user_id: "",
      broadcaster_user_login: "",
      broadcaster_user_name: "",
    },
    jest.mocked(
      new ApiClient({
        authProvider: jest.mocked(new StaticAuthProvider("", "")),
      })
    )
  );
  twitch.handleUnmod(event);

  // Ensure our list is now empty
  getList = await queue.modlist();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.online).toHaveLength(0);
  });
});
