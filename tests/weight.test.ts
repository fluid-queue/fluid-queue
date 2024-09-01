// imports
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
} from "./simulation.js";
import { Queue, QueueDataMap, WeightedList } from "fluid-queue/queue.js";

// console checks
const consoleWarnMock = jest.spyOn(global.console, "warn");
const consoleErrorMock = jest.spyOn(global.console, "error");

jest.useFakeTimers();

const setupMocks = () => {
  // reset chatters
  simSetChatters(EMPTY_CHATTERS);

  // reset time
  jest.setSystemTime(START_TIME);

  // reset console
  consoleWarnMock.mockClear();
  consoleErrorMock.mockClear();
};

beforeEach(setupMocks);

async function setupQueue() {
  const volume = createMockVolume();
  const index = await simRequireIndex(
    volume,
    DEFAULT_TEST_SETTINGS,
    START_TIME,
    setupMocks,
    7
  );
  const queue: Queue = index.quesoqueue;
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }
  const twitch = index.twitch;
  const handle_func = index.handle_func;

  const getList: QueueDataMap<WeightedList> = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(0);
    expect(list.offlineLength).toBe(0);
    expect(list.entries).toHaveLength(0);
  });

  const testUser1 = buildChatter("test_user_1", "にゃん", false, false, false);
  const testUser2 = buildChatter("test_user_2", "にゃ", false, false, false);
  const testUser3 = buildChatter("test_user_3", "みゃ", false, false, false);

  const level1 = "D36-010-5YF";
  const level2 = "MY2-H2M-DSG";
  const level3 = "GBJ-6QY-P8G";

  let added;
  added = queue.add(level1, testUser1);
  expect(added).toContain("has been added to the queue");
  added = queue.add(level2, testUser2);
  expect(added).toContain("has been added to the queue");
  added = queue.add(level3, testUser3);
  expect(added).toContain("has been added to the queue");
  return {
    queue,
    twitch,
    testUser1,
    testUser2,
    testUser3,
    level1,
    level2,
    level3,
    handle_func,
  };
}

test("weight test", async () => {
  const { queue, twitch, testUser1, testUser2, level1, level2 } =
    await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }

  // no one is online yet!
  let getList = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(0);
    expect(list.offlineLength).toBe(3);
    expect(list.entries).toHaveLength(0);
  });

  // user 2 is now online
  twitch.noticeChatter(testUser2);

  getList = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(1);
    expect(list.offlineLength).toBe(2);
    expect(list.entries).toHaveLength(1);
    const entry = list.entries[0];
    expect(entry.level.serializePersistedQueueEntry()).toEqual({
      id: "44047f87-adde-4d54-a164-10ac49ace8b1",
      submitter: {
        id: testUser2.id,
        name: testUser2.name,
        displayName: testUser2.displayName,
      },
      submitted: "2022-04-21T00:00:00.000Z",
      type: "smm2",
      code: level2,
      data: undefined,
    });
    // position is 0 even though its oflline position is 1 (index), but it is position 0 for the online position
    expect(entry.position).toBe(0);
    expect(entry.weight()).toBe(1);
  });

  // keep user 2 online
  simSetChatters([testUser2]);

  // let time pass! 10 minutes
  await simAdvanceTime(10 * 60 * 1000, 60 * 1000);

  // now user 1 is online too
  twitch.noticeChatter(testUser1);

  getList = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(12); // total weight is now 12
    expect(list.offlineLength).toBe(1);
    expect(list.entries).toHaveLength(2);
    let entry = list.entries[0];
    expect(entry.level.serializePersistedQueueEntry()).toEqual({
      id: "44047f87-adde-4d54-a164-10ac49ace8b1",
      submitter: {
        id: testUser2.id,
        name: testUser2.name,
        displayName: testUser2.displayName,
      },
      submitted: "2022-04-21T00:00:00.000Z",
      type: "smm2",
      code: level2,
      data: undefined,
    });
    expect(entry.position).toBe(1); // level 1 was submitted before level 2
    expect(entry.weight()).toBe(11); // gained +10 weight
    entry = list.entries[1];
    expect(entry.level.serializePersistedQueueEntry()).toEqual({
      id: "133ac751-70fa-4974-ba4e-89438016126b",
      submitter: {
        id: testUser1.id,
        name: testUser1.name,
        displayName: testUser1.displayName,
      },
      submitted: "2022-04-21T00:00:00.000Z",
      type: "smm2",
      code: level1,
      data: undefined,
    });
    expect(entry.position).toBe(0); // level 1 was submitted before level 2
    expect(entry.weight()).toBe(1);
  });
});

test("weight rename test", async () => {
  const { queue, twitch, testUser1, testUser2, testUser3, handle_func } =
    await setupQueue();
  if (queue.testAccess === undefined) {
    throw new Error("testAccess is undefined");
  }
  // 10min
  await simAdvanceTime(10 * 60 * 1000, 60 * 1000);

  // no one is online yet!
  let getList = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(0);
    expect(list.offlineLength).toBe(3);
    expect(list.entries).toHaveLength(0);
  });

  simSetChatters([testUser1, testUser2, testUser3]); // everyone is online

  // 10min
  await simAdvanceTime(10 * 60 * 1000, 60 * 1000);

  getList = await queue.weightedList();
  queue.testAccess((data) => {
    const list = getList(data);
    expect(list.totalWeight).toBe(33); // everyone starts with 1 and then gets 10 for the 10min wait
    expect(list.offlineLength).toBe(0);
    expect(list.entries).toHaveLength(3);
  });

  const testUser1Update1 = buildChatter(
    "test_user_renamed_1",
    "にゃんにゃん",
    false,
    false,
    false,
    testUser1.id
  );

  simSetChatters([testUser1Update1, testUser2, testUser3]);

  // automatic rename!
  let list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(3);
    expect(queueList.online[0].submitter.name).toEqual("test_user_renamed_1");
    expect(queueList.online[0].submitter.displayName).toEqual("にゃんにゃん");
    expect(queueList.online[0].submitter.toString()).toEqual("にゃんにゃん");
  });

  const testUser1Update2 = buildChatter(
    "test_user_renamed_again_1",
    "にゃんにゃんにゃん",
    false,
    false,
    false,
    testUser1.id
  );

  twitch.noticeChatter(testUser1Update2);

  // automatic rename through noticeChatter!
  list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(3);
    expect(queueList.online[0].submitter.name).toEqual(
      "test_user_renamed_again_1"
    );
    expect(queueList.online[0].submitter.displayName).toEqual(
      "にゃんにゃんにゃん"
    );
    expect(queueList.online[0].submitter.toString()).toEqual(
      "にゃんにゃんにゃん"
    );
    // even waiting is renamed, but just because it has the same user object (and not a copy)
    expect(data.waitingByUserId[testUser1.id].toJson()).toEqual({
      user: {
        id: testUser1.id,
        name: "test_user_renamed_again_1",
        displayName: "にゃんにゃんにゃん",
      },
      waiting: { minutes: 11 },
      weight: { minutes: 11, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });

  simSetChatters([testUser1Update2, testUser2, testUser3]);

  // save the queue
  queue.testAccess((data) => {
    data.saveLater();
  });

  // reload the queue from disk (this causes the user objects to be different objects)
  await queue.load();

  // now update a different user
  const testUser2Update1 = buildChatter(
    "test_user_renamed_2",
    "にゃにゃ",
    false,
    false,
    false,
    testUser2.id
  );
  simSetChatters([testUser1Update2, testUser2Update1, testUser3]);

  list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(3);
    expect(queueList.online[1].submitter.name).toEqual("test_user_renamed_2");
    expect(queueList.online[1].submitter.displayName).toEqual("にゃにゃ");
    expect(queueList.online[1].submitter.toString()).toEqual("にゃにゃ");
    // waiting is not renamed yet, since this time the user object is not shared
    expect(data.waitingByUserId[testUser2.id].toJson()).toEqual({
      user: {
        id: testUser2.id,
        name: "test_user_2",
        displayName: "にゃ",
      },
      waiting: { minutes: 11 },
      weight: { minutes: 11, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });

  // now test that waiting is renamed after one weight is added

  // 1min
  await simAdvanceTime(1 * 60 * 1000, 60 * 1000);

  list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(3);
    expect(queueList.online[1].submitter.name).toEqual("test_user_renamed_2");
    expect(queueList.online[1].submitter.displayName).toEqual("にゃにゃ");
    expect(queueList.online[1].submitter.toString()).toEqual("にゃにゃ");
    // waiting is not renamed yet, since this time the user object is not shared
    expect(data.waitingByUserId[testUser2.id].toJson()).toEqual({
      user: {
        id: testUser2.id,
        name: "test_user_renamed_2",
        displayName: "にゃにゃ",
      },
      waiting: { minutes: 12 },
      weight: { minutes: 12, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });

  // one last thing! renaming users from a custom code has its extra logic for renaming (implementation detail)
  const responder = jest.fn();
  await handle_func(
    "!customcode add Kamek 2PV-J29-2PF",
    buildChatter("broadcaster", "Broadcaster", true, true, true),
    responder
  );
  expect(responder).toHaveBeenCalledTimes(1);
  expect(responder).toHaveBeenCalledWith(
    "Your custom code Kamek for 2PV-J29-2PF (maker code) has been added."
  );

  const testUser4 = buildChatter(
    "test_user_4",
    "TestUser4",
    false,
    false,
    false
  );

  const added = queue.add("Kamek", testUser4);
  expect(added).toContain("has been added to the queue");

  simSetChatters([testUser1Update2, testUser2Update1, testUser3, testUser4]);
  twitch.noticeChatter(testUser4);

  // just test if adding was successful
  list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(4);
    expect(queueList.online[3].submitter.name).toEqual("test_user_4");
    expect(queueList.online[3].submitter.displayName).toEqual("TestUser4");
    expect(queueList.online[3].submitter.toString()).toEqual("TestUser4");
    expect(queueList.online[3].toString()).toEqual("2PV-J29-2PF (maker code)");
    // waiting was initialized
    expect(data.waitingByUserId[testUser4.id].toJson()).toEqual({
      user: {
        id: testUser4.id,
        name: "test_user_4",
        displayName: "TestUser4",
      },
      waiting: { minutes: 1 },
      weight: { minutes: 1, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });

  // 1min
  await simAdvanceTime(1 * 60 * 1000, 60 * 1000);

  // waiting was increased
  queue.testAccess((data) => {
    // waiting was renamed too, because the object is shared
    expect(data.waitingByUserId[testUser4.id].toJson()).toEqual({
      user: {
        id: testUser4.id,
        name: "test_user_4",
        displayName: "TestUser4",
      },
      waiting: { minutes: 2 },
      weight: { minutes: 2, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });

  // now rename the user
  const testUser4Update1 = buildChatter(
    "liquidnya",
    "liquidnya",
    false,
    false,
    false,
    testUser4.id
  );
  simSetChatters([
    testUser1Update2,
    testUser2Update1,
    testUser3,
    testUser4Update1,
  ]);
  twitch.noticeChatter(testUser4Update1);

  // name should be updated
  list = await queue.list();
  queue.testAccess((data) => {
    const queueList = list(data);
    expect(queueList.online.length).toEqual(4);
    expect(queueList.online[3].submitter.name).toEqual("liquidnya");
    expect(queueList.online[3].submitter.displayName).toEqual("liquidnya");
    expect(queueList.online[3].submitter.toString()).toEqual("liquidnya");
    expect(queueList.online[3].toString()).toEqual("2PV-J29-2PF (maker code)");
    // waiting was renamed too, because the object is shared
    expect(data.waitingByUserId[testUser4.id].toJson()).toEqual({
      user: {
        id: testUser4.id,
        name: "liquidnya",
        displayName: "liquidnya",
      },
      waiting: { minutes: 2 },
      weight: { minutes: 2, milliseconds: 0 },
      lastOnline: new Date().toISOString(),
    });
  });
});
