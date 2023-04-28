import { jest } from "@jest/globals";
import {
  DEFAULT_TEST_SETTINGS,
  asMock,
  createMockVolume,
  mockTwitchApi,
} from "./simulation.js";
import { User } from "../src/extensions-api/queue-entry.js";
import { Volume, createFsFromVolume } from "memfs";

const mockChatters: User[] = [];

async function setupMocks(
  volume?: InstanceType<typeof Volume>
): Promise<typeof fs> {
  const { twitchApi } = await mockTwitchApi();
  asMock(twitchApi.getChatters).mockImplementation(() =>
    Promise.resolve(mockChatters)
  );
  if (volume == null) {
    volume = createMockVolume(DEFAULT_TEST_SETTINGS);
  }
  // setup virtual file system
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
  const fs = (await import("fs")).default;
  return fs;
}

async function runHooks(hooks: (() => Promise<void> | void)[]): Promise<void> {
  for (const hook of hooks) {
    await Promise.resolve(hook());
  }
}

test("UpgradeEngine:load", async () => {
  await setupMocks();
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => "loaded");
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("loaded");
  expect(result.save).toEqual(false);
  expect(result.upgradeHooks).toEqual([]);
  await expect(engine.loadNewest()).resolves.toEqual("loaded");
});

test("UpgradeEngine:create", async () => {
  await setupMocks();
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => null);
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("created");
  expect(result.save).toEqual(true);
  expect(result.upgradeHooks).toEqual([]);
  await expect(engine.loadNewest()).resolves.toEqual(null);
});

test("UpgradeEngine:upgrade", async () => {
  await setupMocks();
  let upgradeHookCalled = false;
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => "loaded").upgrade(
    (value) => ({
      data: `upgraded(${value})`,
      upgradeHooks: [
        () => {
          upgradeHookCalled = true;
        },
      ],
    }),
    () => null
  );
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("upgraded(loaded)");
  expect(result.save).toEqual(true);
  expect(result.upgradeHooks.length).toEqual(1);
  expect(upgradeHookCalled).toEqual(false);
  await runHooks(result.upgradeHooks);
  expect(upgradeHookCalled).toEqual(true);
  await expect(engine.loadNewest()).resolves.toEqual(null);
});

test("UpgradeEngine:create-with-upgrade", async () => {
  await setupMocks();
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => null).upgrade(
    (value) => ({
      data: `upgraded(${value})`,
      upgradeHooks: [
        () => {
          // noop
        },
      ],
    }),
    () => null
  );
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("created");
  expect(result.save).toEqual(true);
  expect(result.upgradeHooks.length).toEqual(0);
  await expect(engine.loadNewest()).resolves.toEqual(null);
});

test("UpgradeEngine:load-with-upgrade", async () => {
  await setupMocks();
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => "loaded").upgrade(
    (value) => ({
      data: `upgraded(${value})`,
      upgradeHooks: [
        () => {
          // noop
        },
      ],
    }),
    () => "loaded-newest"
  );
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("loaded-newest");
  expect(result.save).toEqual(false);
  expect(result.upgradeHooks.length).toEqual(0);
  await expect(engine.loadNewest()).resolves.toEqual("loaded-newest");
});

test("UpgradeEngine:upgrade-twice", async () => {
  const hookCalls: string[] = [];
  await setupMocks();
  const { UpgradeEngine } = await import("../src/persistence.js");
  const engine = UpgradeEngine.from<string>(() => "loaded")
    .upgrade(
      (value) => ({
        data: `upgraded(${value})`,
        upgradeHooks: [
          () => {
            hookCalls.push("upgraded");
          },
        ],
      }),
      () => null
    )
    .upgrade(
      (value) => ({
        data: `upgraded2(${value})`,
        upgradeHooks: [
          () => {
            hookCalls.push("upgraded2");
          },
        ],
      }),
      () => null
    );
  const result = await engine.load(() => "created");
  expect(result.data).toEqual("upgraded2(upgraded(loaded))");
  expect(result.save).toEqual(true);
  expect(result.upgradeHooks.length).toEqual(2);
  await runHooks(result.upgradeHooks);
  expect(hookCalls).toEqual(["upgraded", "upgraded2"]);
  await expect(engine.loadNewest()).resolves.toEqual(null);
});
