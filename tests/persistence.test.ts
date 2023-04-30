import { jest } from "@jest/globals";
import {
  DEFAULT_TEST_SETTINGS,
  asMock,
  createMockVolume,
  expectErrorMessage,
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

class SaveAndVerify<T> {
  data: T | null;
  save: (value: T) => PromiseLike<void> | void;
  verify: () => PromiseLike<T | null> | T | null;

  constructor() {
    this.data = null;
    this.save = jest.fn((value: T) => {
      this.data = value;
    });
    this.verify = jest.fn(() => {
      return this.data;
    });
  }

  static create<T>() {
    const saveAndVerify = new SaveAndVerify<T>();
    return { save: saveAndVerify.save, verify: saveAndVerify.verify };
  }
}

test("loadResultActions:data", async () => {
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  const result = await loadResultActions(
    {
      data: "data",
      save: false,
      upgradeHooks: [],
    },
    save,
    verify
  );
  expect(result).toEqual("data");
  expect(save).toBeCalledTimes(0);
  expect(verify).toBeCalledTimes(0);
});

test("loadResultActions:save-and-verify", async () => {
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  const result = await loadResultActions(
    {
      data: "data",
      save: true,
      upgradeHooks: [],
    },
    save,
    verify
  );
  expect(result).toEqual("data");
  expect(save).toBeCalledTimes(1);
  expect(verify).toBeCalledTimes(1);
  expect(asMock(save).mock.calls[0][0]).toEqual("data");
});

test("loadResultActions:save-and-verify-hooks-abort-null", async () => {
  const hookCalls: number[] = [];
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  asMock(verify).mockReturnValue(null);
  const promise = loadResultActions(
    {
      data: "data",
      save: false, // note that save is false, but it will still save, because of hooks!
      upgradeHooks: [
        () => void hookCalls.push(1),
        () => void hookCalls.push(2),
        () => void hookCalls.push(3),
      ],
    },
    save,
    verify
  );
  await expectErrorMessage(promise).toMatch(
    /Creating save file from an old version failed!/
  );
  expect(hookCalls).toEqual([]); // none of the hooks have been called!
  expect(save).toBeCalledTimes(1);
  expect(verify).toBeCalledTimes(1);
  expect(asMock(save).mock.calls[0][0]).toEqual("data");
});

test("loadResultActions:save-and-verify-hooks-abort-throws", async () => {
  const hookCalls: number[] = [];
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  asMock(verify).mockImplementation(() => {
    throw new Error("Loading failed!");
  });
  const promise = loadResultActions(
    {
      data: "data",
      save: false, // note that save is false, but it will still save, because of hooks!
      upgradeHooks: [
        () => void hookCalls.push(1),
        () => void hookCalls.push(2),
        () => void hookCalls.push(3),
      ],
    },
    save,
    verify
  );
  await expectErrorMessage(promise).toMatch(/Loading failed!/);
  expect(hookCalls).toEqual([]); // none of the hooks have been called!
  expect(save).toBeCalledTimes(1);
  expect(verify).toBeCalledTimes(1);
  expect(asMock(save).mock.calls[0][0]).toEqual("data");
});

test("loadResultActions:save-and-verify-hooks-abort-save-off", async () => {
  const hookCalls: number[] = [];
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  const promise = loadResultActions(
    {
      data: "data",
      save: true,
      upgradeHooks: [
        () => void hookCalls.push(1),
        () => void hookCalls.push(2),
        () => void hookCalls.push(3),
      ],
    },
    save,
    verify,
    { save: false }
  );
  await expectErrorMessage(promise).toMatch(
    /Can not upgrade save file while saving is turned off!/
  );
  expect(hookCalls).toEqual([]); // none of the hooks have been called!
  expect(save).toBeCalledTimes(0);
  expect(verify).toBeCalledTimes(0);
});

test("loadResultActions:save-and-verify-save-off", async () => {
  const consoleWarnMock = jest.spyOn(global.console, "warn");
  // this works because there are no hooks
  await setupMocks();
  const { loadResultActions } = await import("../src/persistence.js");
  const { save, verify } = SaveAndVerify.create<string>();
  const result = await loadResultActions(
    {
      data: "data",
      save: true,
      upgradeHooks: [],
    },
    save,
    verify,
    { save: false }
  );
  expect(result).toEqual("data");
  expect(save).toBeCalledTimes(0);
  expect(verify).toBeCalledTimes(0);
  expect(consoleWarnMock).toHaveBeenCalledWith(
    "Upgraded save file while saving is turned off! Please make sure to save the changes manually or else the upgrade is lost."
  );
});
