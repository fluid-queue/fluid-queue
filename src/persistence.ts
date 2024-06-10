import settings from "./settings.js";
import fs from "fs";
import gracefulFs from "graceful-fs";
import { sync as writeFileAtomicSync } from "write-file-atomic";
import { WaitingSchemeV3 } from "./waiting.js";
import path from "path";
import { z } from "zod";
import { twitchApi } from "./twitch-api.js";
import { User } from "./extensions-api/queue-entry.js";
import { log, warn, error } from "./chalk-print.js";
import { ZodTypeUnknown } from "./zod.js";
import { v4 as uuidv4 } from "uuid";

const DATA_DIRECTORY = "data";
const VERSIONED_FILE_NAME = path.join(DATA_DIRECTORY, "queue.json");
const CURRENT_VERSION = "3.1";
const QUEUE_V2 = {
  fileName: VERSIONED_FILE_NAME,
  version: "2.2", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
};
const CUSTOM_CODES_V2 = {
  fileName: path.join(DATA_DIRECTORY, "extensions", "customcode.json"),
  version: "2.0", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
};
const lostLevelsFileName = (now: string) => {
  return path.join(
    DATA_DIRECTORY,
    `lost-levels-${now.replaceAll(":", "").split(".")[0]}Z.json`
  );
};

// legacy files that are converted at startup
const QUEUE_V1 = {
  queso: "queso.save",
  userOnlineTime: "userOnlineTime.txt",
  userWaitTime: "userWaitTime.txt",
  waitingUsers: "waitingUsers.txt",
  // `customCodes.json` is not in here, because it would be deleted by the queue file creation
};
const CUSTOM_CODES_V1 = {
  customCodes: "customCodes.json",
  // for easier migration from old Docker (demize/quesoqueue)
  customCodesInData: "data/customCodes.json",
};
const LEGACY_CUSTOM_CODES = ["R0M-HAK-LVL", "UNC-LEA-RED"]; // these level codes have been used for custom level types before introducing custom level types with UUIDs

const LevelV1 = z.object({
  code: z.string().describe("contains the level code as a string"),
  submitter: z.string().describe("contains the display name of the submitter"),
  username: z
    .string()
    .optional()
    .describe("contains the username of the submitter"),
  current_level: z
    .boolean()
    .default(false)
    .describe(
      "boolean if it is the level that is currently being played (default is false)"
    ),
});
type LevelV1 = z.infer<typeof LevelV1>;
const QueueV1 = LevelV1.array();
type QueueV1 = z.infer<typeof QueueV1>;

const WaitingUsersV1 = z.string().describe("waiting username").array();
type WaitingUsersV1 = z.infer<typeof WaitingUsersV1>;
const UserWaitTimeV1 = z
  .number()
  .int()
  .nonnegative()
  .describe("wait time in minutes")
  .array();
type UserWaitTimeV1 = z.infer<typeof UserWaitTimeV1>;
const UserOnlineTimeV1 = z
  .string()
  .datetime()
  .describe("the time someone was last online in the queue")
  .array()
  .nullable();
type UserOnlineTimeV1 = z.infer<typeof UserOnlineTimeV1>;

const EntryV2 = z.object({
  code: z.string().describe("contains the level code as a string").optional(),
  type: z.string().nullable().default(null),
  data: z.unknown().optional(),
});

export type EntryV2 = z.infer<typeof EntryV2>;

const SubmittedEntryV2 = z
  .object({
    submitter: z
      .string()
      .describe("contains the display name of the submitter"),
    username: z.string().describe("contains the username of the submitter"),
  })
  .merge(EntryV2);
type SubmittedEntryV2 = z.infer<typeof SubmittedEntryV2>;

interface ExtensionDataV2<T> {
  version: string;
  data: T;
}

function ExtensionDataV2<ItemType extends ZodTypeUnknown>(
  itemSchema: ItemType
) {
  return z.object({
    version: z
      .string()
      .describe(
        "the version of the extension data; independant from the queue save file version and npm version"
      ),
    data: itemSchema.describe("the data associated with the extension"),
  });
}

export const WaitingSchemeV2 = z
  .object({
    waitTime: z.number().int().nonnegative().describe("wait time in minutes"),
    weightMin: z
      .number()
      .int()
      .nonnegative()
      .describe("the weighted time for weighted random in minutes")
      .optional(),
    weightMsec: z
      .number()
      .int()
      .gte(0)
      .lt(60000)
      .describe(
        "the milliseconds part of the weight time, between 0 (inclusive) and 59999 (inclusive)"
      )
      .optional(),
    lastOnlineTime: z
      .string()
      .datetime()
      .describe(
        "the time someone was last online in the queue as ISO 8601 timestamp"
      ),
  })
  .transform((waiting) => {
    const weightMin = waiting.weightMin ?? waiting.waitTime;
    const weightMsec = waiting.weightMsec ?? 0;
    return { ...waiting, weightMin, weightMsec };
  });
export type WaitingV2 = z.infer<typeof WaitingSchemeV2>;

const QueueV2 = z.object({
  version: z
    .string()
    .describe(
      `will have the value "2.0" for now, but might change to "2.1", or "3.0", etc.; later the queue accepts anything starting with "2." and will reject the file otherwise (crash); this version is independant of the npm version`
    ),
  currentLevel: SubmittedEntryV2.nullable().describe(
    "null or the current level"
  ),
  queue: SubmittedEntryV2.array().describe(
    `list of levels (not including the current level)`
  ),
  waiting: z.record(z.string().describe("waiting username"), WaitingSchemeV2),
  extensions: z
    .record(
      z.string().describe("the extension name"),
      ExtensionDataV2(z.unknown())
    )
    .default({}),
});
type QueueV2 = z.infer<typeof QueueV2>;

const EntryV3 = z.object({
  type: z.string().nullable(), // not optional any more!
  code: z.string().describe("contains the level code as a string").optional(),
  data: z.unknown().optional(),
});
export type EntryV3 = z.infer<typeof EntryV3>;

// this is now its own object
const SubmittedEntryV3_0 = z
  .object({
    submitter: z
      .object({
        id: z.string().describe("the user id"),
        name: z.string().describe("the login name / username"),
        displayName: z.string().describe("the display name"),
      })
      .describe("the submitter of this queue entry"),
  })
  .merge(EntryV3);
type SubmittedEntryV3_0 = z.infer<typeof SubmittedEntryV3_0>;

// this is now its own object
const SubmittedEntryV3_1 = z
  .object({
    // using UUIDs for levels
    // note that only levels that are submitted to the queue have an ID
    // the ID is of that submission and not that of the level
    id: z.string().uuid(),
    submitter: z
      .object({
        id: z.string().describe("the user id"),
        name: z.string().describe("the login name / username"),
        displayName: z.string().describe("the display name"),
      })
      .describe("the submitter of this queue entry"),
    submitted: z.string().datetime(),
  })
  .merge(EntryV3);
type SubmittedEntryV3_1 = z.infer<typeof SubmittedEntryV3_1>;

type ExtensionDataV3<T> = ExtensionDataV2<T>;

function ExtensionDataV3<ItemType extends ZodTypeUnknown>(
  itemSchema: ItemType
) {
  return ExtensionDataV2(itemSchema);
}

const VersionedObjectScheme = z
  .object({
    version: z.string(),
  })
  .passthrough();

type VersionedObject = z.output<typeof VersionedObjectScheme>;

export const QueueV3_0 = z.object({
  version: z
    .string()
    .describe(
      `the version of this save file which has to be starting with "3." or be "3"`
    )
    .refine(
      (version) => version == "3" || version.startsWith("3."),
      'version has to be starting with "3." or be "3"'
    ),
  entries: z.object({
    current: SubmittedEntryV3_0.nullable().describe(
      "the currently selected queue entry or null"
    ),
    queue: SubmittedEntryV3_0.array().describe("entries in queue"),
  }),
  waiting: WaitingSchemeV3.array(),
  extensions: z
    .record(
      z.string().describe("the extension name"),
      ExtensionDataV3(z.unknown().optional())
    )
    .default({}),
});

export const QueueV3_1 = z.object({
  version: z
    .string()
    .describe(
      `the version of this save file which has to be starting with "3." or be "3"`
    )
    .refine(
      (version) => version == "3" || version.startsWith("3."),
      'version has to be starting with "3." or be "3"'
    ),
  entries: z.object({
    current: SubmittedEntryV3_1.nullable().describe(
      "the currently selected queue entry or null"
    ),
    queue: SubmittedEntryV3_1.array().describe("entries in queue"),
  }),
  waiting: WaitingSchemeV3.array(),
  extensions: z
    .record(
      z.string().describe("the extension name"),
      ExtensionDataV3(z.unknown().optional())
    )
    .default({}),
});

const CustomCodesV1 = z
  .tuple([z.string(), z.string()])
  .array()
  .transform((array) => Object.fromEntries(array));
type CustomCodesV1 = z.infer<typeof CustomCodesV1>;

const CustomCodesV2 = z.record(z.string().describe("custom code"), EntryV2);
export type CustomCodesV2 = z.infer<typeof CustomCodesV2>;

export const patchGlobalFs = () => {
  gracefulFs.gracefulify(fs);
};

function loadFileDefault<T>(
  parse: (value: unknown) => T,
  fileName: string,
  newContent: T,
  errorMessage?: string
): T {
  if (fs.existsSync(fileName)) {
    try {
      const fileContents: unknown = JSON.parse(
        fs.readFileSync(fileName, { encoding: "utf8" })
      );
      log(`${fileName} has been successfully validated.`);
      return parse(fileContents);
    } catch (err) {
      if (errorMessage != null) {
        warn(
          `An error occurred when trying to load ${fileName}. ${errorMessage}`
        );
      } else {
        warn(
          `An error occurred when trying to load ${fileName}. ${String(err)}`
        );
      }
      // let it crash!
      throw err;
    }
  }
  return newContent;
}

const loadQueueV1 = (now: string): UpgradeResult<QueueV2> | null => {
  if (!Object.values(QUEUE_V1).some((file) => fs.existsSync(file))) {
    return null;
  }
  let levelsV2: SubmittedEntryV2[] = [];
  let currentLevel: SubmittedEntryV2 | null = null;
  // load levels
  if (fs.existsSync(QUEUE_V1.queso)) {
    const levelsV1 = loadFileDefault<QueueV1>(
      QueueV1.parse.bind(QueueV1),
      QUEUE_V1.queso,
      []
    );
    if (levelsV1.some((level) => level.username == null)) {
      warn(`Usernames are not set in the file ${QUEUE_V1.queso}!`);
      warn(
        "Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names."
      );
      warn("To be safe, clear the queue with !clear.");
    }
    const upgrade = ({
      code,
      submitter,
      username,
    }: LevelV1): SubmittedEntryV2 => {
      return {
        code,
        type: null,
        submitter,
        username: username ?? submitter.toLowerCase(),
      };
    };
    const index = levelsV1.findIndex((level) => level.current_level == true);
    if (index != -1) {
      const [removedLevel] = levelsV1.splice(index, 1);
      currentLevel = upgrade(removedLevel);
    }
    levelsV2 = levelsV1.map(upgrade);
  }
  // load wait time
  const waitingUsers = loadFileDefault<WaitingUsersV1>(
    WaitingUsersV1.parse.bind(WaitingUsersV1),
    QUEUE_V1.waitingUsers,
    [],
    "Weighted chance will not function."
  );
  const userWaitTime = loadFileDefault<UserWaitTimeV1>(
    UserWaitTimeV1.parse.bind(UserWaitTimeV1),
    QUEUE_V1.userWaitTime,
    [],
    "Weighted chance will not function."
  );
  if (waitingUsers.length != userWaitTime.length) {
    throw new Error(
      `Data is corrupt: list lenght mismatch between files ${QUEUE_V1.waitingUsers} and ${QUEUE_V1.userWaitTime}.`
    );
  }
  const userOnlineTime = loadFileDefault<UserOnlineTimeV1>(
    UserOnlineTimeV1.parse.bind(UserOnlineTimeV1),
    QUEUE_V1.userOnlineTime,
    null,
    "Online time will not be calculated correctly."
  );
  if (userOnlineTime != null && waitingUsers.length != userOnlineTime.length) {
    throw new Error(
      `Data is corrupt: list lenght mismatch between files ${QUEUE_V1.waitingUsers} and ${QUEUE_V1.userOnlineTime}.`
    );
  }
  // convert wait time to object
  const waiting = upgradeWaiting(
    waitingUsers,
    userWaitTime,
    userOnlineTime,
    now
  );
  // now add anyone who is in the queue, but not waiting
  // note: the current level does not have a wait time!
  levelsV2.forEach((level) => {
    if (!(level.username in waiting)) {
      waiting[level.username] = {
        lastOnlineTime: now,
        waitTime: 1,
        weightMin: 1,
        weightMsec: 0,
      };
    }
  });
  const result: z.output<typeof QueueV2> = {
    version: QUEUE_V2.version,
    currentLevel,
    queue: levelsV2,
    waiting,
    extensions: {},
  };
  let filesDescription;
  if (Object.keys(QUEUE_V1).length == 1) {
    filesDescription = "a previous save file";
  } else {
    filesDescription = "previous save files";
  }
  log(
    `${VERSIONED_FILE_NAME} has been successfully created from ${filesDescription}.`
  );
  return {
    data: result,
    upgradeHooks: [
      () => {
        // at this point assume everything was converted successfully (an error would have been thrown instead)
        // now delete version 1 files
        Object.values(QUEUE_V1).forEach((file) => {
          if (fs.existsSync(file)) {
            try {
              fs.unlinkSync(file);
              log(`${file} has been deleted successfully.`);
            } catch (err) {
              warn(`${file} could not be deleted. ${String(err)}`);
              // this error can be safely ignored!
            }
          }
        });
      },
    ],
  };
};

const upgradeWaiting = (
  waitingUsers: WaitingUsersV1,
  userWaitTime: UserWaitTimeV1,
  userOnlineTime: UserOnlineTimeV1,
  now: string
): Record<string, WaitingV2> => {
  const waiting: Record<string, WaitingV2> = {};
  for (let index = 0; index < waitingUsers.length; index++) {
    const username = waitingUsers[index];
    const waitTime = userWaitTime[index];
    const lastOnlineTime = userOnlineTime?.at(index) ?? now;
    waiting[username] = {
      waitTime,
      weightMin: waitTime,
      weightMsec: 0,
      lastOnlineTime,
    };
  }
  return waiting;
};

const loadQueueV2 = (object: object): InitialLoadResult<QueueV2> => {
  const fileName = QUEUE_V2.fileName;
  const state = QueueV2.parse(object);
  if (!QUEUE_V2.compatibility.test(state.version)) {
    throw new Error(
      `Queue save file ${fileName}: version in file "${state.version}" is not compatible with queue save file version "${QUEUE_V2.version}". Save file is assumed to be incompatible. Did you downgrade versions?`
    );
  }
  log(`${fileName} has been successfully validated.`);
  return { data: state };
};

const loadQueueV3 = (
  object: VersionedObject,
  now: string
): InitialLoadResult<z.output<typeof QueueV3_1>> => {
  const versionArray = object.version.split(".");
  const versions = z.coerce.number().int().array().safeParse(versionArray);
  if (versions.success && versions.data.length >= 2) {
    const minorVersion = versions.data[1];
    if (minorVersion >= 1) {
      const state = QueueV3_1.parse(object);
      log(`${VERSIONED_FILE_NAME} has been successfully validated.`);
      return { data: state };
    }
  }
  // transform 3.0 to 3.1 data
  const queueV3_0 = QueueV3_0.parse(object);
  const transformEntry = (entry: SubmittedEntryV3_0): SubmittedEntryV3_1 => ({
    ...entry,
    id: uuidv4(),
    submitted: now,
  });
  const state = {
    ...queueV3_0,
    entries: {
      current:
        queueV3_0.entries.current === null
          ? null
          : transformEntry(queueV3_0.entries.current),
      queue: queueV3_0.entries.queue.map(transformEntry),
    },
  };
  log(`${VERSIONED_FILE_NAME} has been successfully validated.`);
  // data needs to be saved again
  return { data: state, save: true };
};

const emptyQueue = (): z.output<typeof QueueV3_1> => {
  return {
    version: CURRENT_VERSION,
    entries: {
      current: null,
      queue: [],
    },
    waiting: [],
    extensions: {},
  };
};

const emptyCustomCodes = (): ExtensionDataV2<CustomCodesV2> => {
  return {
    version: CUSTOM_CODES_V2.version,
    data: {},
  };
};

export class UpgradeEngine<T> {
  private loader: (now: string) => Promise<LoadResult<T> | null>;
  private newestLoader: (now: string) => Promise<T | null>;

  private constructor(
    load: (
      now: string
    ) => PromiseLike<LoadResult<T> | null> | LoadResult<T> | null,
    newestLoad: (now: string) => PromiseLike<T | null> | T | null
  ) {
    this.loader = (now) => Promise.resolve(load(now));
    this.newestLoader = (now) => Promise.resolve(newestLoad(now));
  }

  static from<T>(load: (now: string) => PromiseLike<T | null> | T | null) {
    return new UpgradeEngine<T>(async (now) => {
      const result = await Promise.resolve(load(now));
      if (result == null) {
        return null;
      }
      return {
        data: result,
        save: false,
        upgradeHooks: [],
      };
    }, load);
  }

  upgrade<U>(
    upgrade: (value: T) => PromiseLike<UpgradeResult<U>> | UpgradeResult<U>,
    load: () => PromiseLike<U | null> | U | null
  ): UpgradeEngine<U>;
  upgrade<U, A>(
    upgrade: (value: T) => PromiseLike<UpgradeResult<U>> | UpgradeResult<U>,
    versionedFile: VersionedFile<A, U>,
    fileName: string
  ): UpgradeEngine<A>;
  upgrade<U, A>(
    upgrade: (value: T) => PromiseLike<UpgradeResult<U>> | UpgradeResult<U>,
    load: (() => PromiseLike<U | null> | U | null) | VersionedFile<A, U>,
    fileName?: string
  ): UpgradeEngine<U> | UpgradeEngine<A> {
    if (load instanceof VersionedFile && fileName !== undefined) {
      return new UpgradeEngine(
        async (now) => {
          const result = await Promise.resolve(load.load(fileName, now));
          if (result != null) {
            return result;
          }
          const previousResult = await this.loader(now);
          if (previousResult != null) {
            const upgradeResult1 = await Promise.resolve(
              upgrade(previousResult.data)
            );
            const upgradeResult2 = await load.upgradeAll(
              upgradeResult1.data,
              now
            );
            return {
              data: upgradeResult2.data,
              save: true,
              upgradeHooks: [
                ...previousResult.upgradeHooks,
                ...upgradeResult1.upgradeHooks,
                ...upgradeResult2.upgradeHooks,
              ],
            };
          }
          return null;
        },
        (now) => load.loadNewest(fileName, now)
      );
    }
    if (typeof load !== "function") {
      throw new Error(
        "Invalid arguments upgrade and load need to be functions."
      );
    }
    return new UpgradeEngine(async (now) => {
      const result = await Promise.resolve(load());
      if (result != null) {
        return { data: result, save: false, upgradeHooks: [] };
      }
      const previousResult = await this.loader(now);
      if (previousResult != null) {
        const upgradeResult = await Promise.resolve(
          upgrade(previousResult.data)
        );
        return {
          data: upgradeResult.data,
          save: true,
          upgradeHooks: [
            ...previousResult.upgradeHooks,
            ...upgradeResult.upgradeHooks,
          ],
        };
      }
      return null;
    }, load);
  }

  async load(
    create: () => PromiseLike<T> | T,
    now?: string
  ): Promise<LoadResult<T>> {
    const result = await this.loader(now ?? new Date().toISOString());
    if (result != null) {
      return result;
    }
    const createResult = await Promise.resolve(create());
    return {
      save: true,
      data: createResult,
      upgradeHooks: [],
    };
  }

  async loadNewest(now?: string): Promise<T | null> {
    return await this.newestLoader(now ?? new Date().toISOString());
  }
}

export async function loadResultActions<T>(
  result: LoadResult<T>,
  save: (value: T) => PromiseLike<void> | void,
  verify: () => PromiseLike<T | null> | T | null,
  options = { save: true }
): Promise<T> {
  if (result.save || result.upgradeHooks.length > 0) {
    // upgrade happened
    if (options.save === false) {
      // this means that the queue is loaded while persistence is turned off
      // only allow this when there are no hooks
      if (result.upgradeHooks.length != 0) {
        throw new Error(
          `Can not upgrade save file while saving is turned off!`
        );
      }
      warn(
        "Upgraded save file while saving is turned off! Please make sure to save the changes manually or else the upgrade is lost."
      );
      return result.data;
    }
    // save the new data
    await Promise.resolve(save(result.data));
    // load the new data
    const verifySave = await verify();
    if (verifySave == null) {
      throw new Error("Creating save file from an old version failed!");
    }
    // now run the upgrade hooks
    for (const hook of result.upgradeHooks) {
      await Promise.resolve(hook());
    }
    return verifySave;
  }
  return result.data;
}

export type InitialLoadResult<T> = {
  save?: boolean;
  data: T;
  upgradeHooks?: (() => Promise<void> | void)[];
};

export type LoadResult<T> = {
  save: boolean;
  data: T;
  upgradeHooks: (() => Promise<void> | void)[];
};

export type UpgradeResult<T> = {
  data: T;
  upgradeHooks: (() => Promise<void> | void)[];
};

export class VersionedFile<T, P = T> {
  private loader: (
    fileMajorVersion: number,
    object: VersionedObject,
    versions: number[],
    now: string
  ) => Promise<LoadResult<T>>;
  readonly upgradeAll: (value: P, now?: string) => Promise<LoadResult<T>>;
  private newestLoader: (
    object: VersionedObject,
    now: string
  ) => PromiseLike<InitialLoadResult<T>> | InitialLoadResult<T>;
  private newestMajorVersion: number;

  private constructor(
    load: (
      fileMajorVersion: number,
      object: VersionedObject,
      versions: number[],
      now: string
    ) => Promise<LoadResult<T>>,
    upgradeAll: (value: P, now?: string) => Promise<LoadResult<T>>,
    newestLoader: (
      object: VersionedObject,
      now: string
    ) => PromiseLike<InitialLoadResult<T>> | InitialLoadResult<T>,
    newestMajorVersion: number
  ) {
    this.loader = load;
    this.upgradeAll = upgradeAll;
    this.newestLoader = newestLoader;
    this.newestMajorVersion = newestMajorVersion;
  }

  static from<T>(
    majorVersion: number,
    load: (
      object: VersionedObject,
      now: string
    ) => PromiseLike<InitialLoadResult<T>> | InitialLoadResult<T>
  ): VersionedFile<T> {
    return new VersionedFile(
      async (
        fileMajorVersion: number,
        object: VersionedObject,
        versions: number[],
        now: string
      ) => {
        if (fileMajorVersion != majorVersion) {
          throw new Error(
            `Save file version ${fileMajorVersion} is incompatible with version${
              versions.length > 0 ? "s" : ""
            } ${[majorVersion, ...versions].join(", ")}.`
          );
        }
        const result = await Promise.resolve(load(object, now));
        return {
          save: false,
          upgradeHooks: [],
          ...result,
        };
      },
      (value) =>
        Promise.resolve({ data: value, save: false, upgradeHooks: [] }),
      load,
      majorVersion
    );
  }

  upgrade<U>(
    upgrade: (
      value: T,
      now: string
    ) => PromiseLike<UpgradeResult<U>> | UpgradeResult<U>,
    majorVersion: number,
    load: (
      object: VersionedObject,
      now: string
    ) => PromiseLike<InitialLoadResult<U>> | InitialLoadResult<U>
  ): VersionedFile<U, P> {
    return new VersionedFile(
      async (
        fileMajorVersion: number,
        object: VersionedObject,
        versions: number[],
        now: string
      ) => {
        if (fileMajorVersion != majorVersion) {
          const result = await this.loader(
            fileMajorVersion,
            object,
            [majorVersion, ...versions],
            now
          );
          const upgradeResult = await Promise.resolve(
            upgrade(result.data, now)
          );
          return {
            data: upgradeResult.data,
            save: true,
            upgradeHooks: [
              ...result.upgradeHooks,
              ...upgradeResult.upgradeHooks,
            ],
          };
        }
        const result = await Promise.resolve(load(object, now));
        return {
          save: false,
          upgradeHooks: [],
          ...result,
        };
      },
      async (value: P, now?: string) => {
        const nowPresent = now ?? new Date().toISOString();
        const result = await this.upgradeAll(value, nowPresent);
        const upgradeResult = await Promise.resolve(
          upgrade(result.data, nowPresent)
        );
        return {
          data: upgradeResult.data,
          save: true,
          upgradeHooks: [...result.upgradeHooks, ...upgradeResult.upgradeHooks],
        };
      },
      load,
      majorVersion
    );
  }

  private async loadFile(fileName: string): Promise<{
    majorVersion: number;
    object: VersionedObject;
  } | null> {
    try {
      await fs.promises.stat(fileName);
      await fs.promises.access(fileName, fs.constants.R_OK);
    } catch (err) {
      if (
        typeof err === "object" &&
        err != null &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        // save file does not exist
        // return null to signal creation of save file or loading an earlier version
        return null;
      }
      throw err;
    }
    const fileContents = await fs.promises.readFile(fileName, {
      encoding: "utf-8",
    });
    const object = await VersionedObjectScheme.parseAsync(
      JSON.parse(fileContents)
    );
    const majorVersionString = object.version.split(".")[0];
    const majorVersion = z.coerce.number().int().safeParse(majorVersionString);
    if (!majorVersion.success) {
      throw new Error(
        `Version in file ${fileName} does not start with a valid number.`
      );
    }
    return { majorVersion: majorVersion.data, object };
  }

  async load(fileName: string, now?: string): Promise<LoadResult<T> | null> {
    const result = await this.loadFile(fileName);
    if (result == null) {
      return result;
    }
    return await this.loader(
      result.majorVersion,
      result.object,
      [],
      now ?? new Date().toISOString()
    );
  }

  async loadNewest(fileName: string, now?: string): Promise<T | null> {
    const result = await this.loadFile(fileName);
    if (result == null) {
      return result;
    }
    if (result.majorVersion != this.newestMajorVersion) {
      throw new Error(
        `Save file version ${result.majorVersion} is incompatible with version ${this.newestMajorVersion}.`
      );
    }
    return (
      await this.newestLoader(result.object, now ?? new Date().toISOString())
    ).data;
  }
}

function loadSync<T>(
  descriptorVersion2: { fileName: string },
  loadVersion2: () => T,
  saveVersion2: (data: T) => void,
  createVersion2: () => T,
  filesVersion1: Record<string, string>,
  loadVersion1: () => T
) {
  // try to load version 2 if file exists
  if (fs.existsSync(descriptorVersion2.fileName)) {
    // for now notice the user of previous save files that can be removed
    // TODO: this is optional and can be removed in a later version of the queue
    Object.values(filesVersion1).forEach((file) => {
      if (fs.existsSync(file)) {
        log(`${file} is no longer needed and can be deleted.`);
      }
    });
    return loadVersion2();
  }
  // if version 2 file does not exist and any version 1 file exists try to convert version 1 to version 2
  if (Object.values(filesVersion1).some((file) => fs.existsSync(file))) {
    const dataVersion1 = loadVersion1();
    saveVersion2(dataVersion1);
    let filesDescription;
    if (Object.keys(filesVersion1).length == 1) {
      filesDescription = "a previous save file";
    } else {
      filesDescription = "previous save files";
    }
    log(
      `${descriptorVersion2.fileName} has been successfully created from ${filesDescription}.`
    );
    const dataVersion2 = loadVersion2();
    // at this point assume everything was converted successfully (an error would have been thrown instead)
    // now delete version 1 files
    Object.values(filesVersion1).forEach((file) => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          log(`${file} has been deleted successfully.`);
        } catch (err) {
          warn(`${file} could not be deleted. ${String(err)}`);
          // this error can be safely ignored!
        }
      }
    });
    return dataVersion2;
  }
  // create an empty save file
  const createdVersion2 = createVersion2();
  saveVersion2(createdVersion2);
  log(`${descriptorVersion2.fileName} has been successfully created.`);
  return loadVersion2();
}

export async function loadQueue(
  options = { save: true }
): Promise<z.output<typeof QueueV3_1>> {
  const now = new Date().toISOString();
  const versionedFile = VersionedFile.from(2, loadQueueV2).upgrade(
    upgradeQueueV2ToV3,
    3,
    loadQueueV3
  );
  const result = await UpgradeEngine.from<UpgradeResult<QueueV2>>(loadQueueV1)
    .upgrade<QueueV2, z.output<typeof QueueV3_1>>(
      (v2) => v2,
      versionedFile,
      VERSIONED_FILE_NAME
    )
    .load(emptyQueue, now);
  return loadResultActions(
    result,
    (data) => void saveQueueSync(data),
    () => versionedFile.loadNewest(VERSIONED_FILE_NAME, now),
    options
  );
}

async function upgradeQueueV2ToV3(
  value: QueueV2,
  now: string
): Promise<UpgradeResult<z.output<typeof QueueV3_1>>> {
  const lostLevels: SubmittedEntryV2[] = [];
  const lostWaiting: (WaitingV2 & { username: string })[] = [];
  let current: z.output<typeof SubmittedEntryV3_1> | null = null;
  const queue: z.output<typeof QueueV3_1>["entries"]["queue"] = [];
  const waiting: z.output<typeof QueueV3_1>["waiting"] = [];
  const upgrade: Record<string, ((user: User) => void)[]> = {};
  const addUpgrade = (
    userName: string,
    upgradeFn: (user: User | null) => void
  ) => {
    if (!(userName in upgrade)) {
      upgrade[userName] = [];
    }
    upgrade[userName].push(upgradeFn);
  };
  const addEntryUpgrade = (
    entry: SubmittedEntryV2,
    entryConsumer: (entry: z.output<typeof SubmittedEntryV3_1>) => void
  ) => {
    addUpgrade(entry.username, (user) => {
      if (user == null) {
        lostLevels.push(entry);
      } else {
        entryConsumer({
          id: uuidv4(),
          type: entry.type,
          code: entry.code,
          data: entry.data,
          submitter: {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
          },
          submitted: now,
        });
      }
    });
  };
  const addWaitingUpgrade = (userName: string, waitingEntry: WaitingV2) => {
    addUpgrade(userName, (user) => {
      if (user == null) {
        lostWaiting.push({ ...waitingEntry, username: userName });
      } else {
        waiting.push({
          user: {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
          },
          lastOnline: waitingEntry.lastOnlineTime,
          waiting: {
            minutes: waitingEntry.waitTime,
          },
          weight: {
            minutes: waitingEntry.weightMin,
            milliseconds: waitingEntry.weightMsec,
          },
        });
      }
    });
  };
  // create upgrades
  if (value.currentLevel != null) {
    addEntryUpgrade(value.currentLevel, (entry) => {
      current = entry;
    });
  }
  for (const entry of value.queue) {
    addEntryUpgrade(entry, (entry) => queue.push(entry));
  }
  for (const [userName, waitingEntry] of Object.entries(value.waiting)) {
    addWaitingUpgrade(userName, waitingEntry);
  }
  // query user ids
  const upgrades = Object.entries(upgrade);
  let lostUsers = 0;
  while (upgrades.length > 0) {
    const upgradeNumber = Math.min(100, upgrades.length);
    log(`Upgrading ${upgradeNumber} out of ${upgrades.length} users...`);
    const next100 = upgrades.splice(0, upgradeNumber);
    const userNames = next100.map(([userName]) => userName);
    const users = await twitchApi.getUsers(userNames);
    const usersByUsername = Object.fromEntries(
      users.map((user) => [user.name, user])
    );
    next100.forEach(([userName, upgrades]) => {
      const user = usersByUsername[userName] ?? null;
      if (user == null) {
        lostUsers++;
      }
      upgrades.forEach((upgrade) => {
        upgrade(user);
      });
    });
  }
  if (lostLevels.length > 0 || lostWaiting.length > 0) {
    const fileName = lostLevelsFileName(now);
    writeFileAtomicSync(
      fileName,
      JSON.stringify(
        { lostLevels, lostWaiting },
        null,
        settings.prettySaveFiles ? 2 : 0
      )
    );
    warn(`${lostUsers} users in your queue could not be found!`);
    warn("This means that they deleted their account or renamed themselves.");
    warn(
      "All waiting times and queue entries of those users have been removed!"
    );
    warn(`The data that could not be converted can be found here: ${fileName}`);
  }
  return {
    data: {
      version: CURRENT_VERSION,
      extensions: value.extensions,
      entries: {
        current,
        queue,
      },
      waiting,
    },
    upgradeHooks: [],
  };
}

const createSaveFileContent = (
  queue: Omit<z.input<typeof QueueV3_1>, "version">
) => {
  return JSON.stringify(
    {
      ...queue,
      version: CURRENT_VERSION,
    },
    null,
    settings.prettySaveFiles ? 2 : 0
  );
};

const createCustomCodesFileContent = (
  data: Omit<ExtensionDataV2<CustomCodesV2>, "version">
) => {
  return JSON.stringify(
    {
      ...data,
      version: CUSTOM_CODES_V2.version,
    },
    null,
    settings.prettySaveFiles ? 2 : 0
  );
};

export const saveQueueSync = (
  data: Omit<z.input<typeof QueueV3_1>, "version">
) => {
  try {
    writeFileAtomicSync(VERSIONED_FILE_NAME, createSaveFileContent(data), {
      encoding: "utf-8",
    });
    return true;
  } catch (err) {
    error(
      `${VERSIONED_FILE_NAME} could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart. ${String(
        err
      )}`
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
    return false;
  }
};

export const loadCustomCodesSync = (): ExtensionDataV2<CustomCodesV2> => {
  return loadSync<ExtensionDataV2<CustomCodesV2>>(
    CUSTOM_CODES_V2,
    loadCustomCodesV2,
    saveCustomCodesSync,
    emptyCustomCodes,
    CUSTOM_CODES_V1,
    loadCustomCodesV1
  );
};

// returns a Map where the key is in uppercase and the entry contains an object with the unmodified `customCode` and the `levelCode`
const loadCustomCodesV1 = (): ExtensionDataV2<CustomCodesV2> => {
  // Check for both variants to ensure everyone can migrate
  let codeListFilename;
  if (fs.existsSync(CUSTOM_CODES_V1.customCodesInData)) {
    codeListFilename = CUSTOM_CODES_V1.customCodesInData;
  } else {
    codeListFilename = CUSTOM_CODES_V1.customCodes;
  }

  const customCodes = loadFileDefault(
    CustomCodesV1.parse.bind(CustomCodesV1),
    codeListFilename,
    {},
    "Custom codes will not function."
  );
  // remove custom levels from custom codes
  const data: CustomCodesV2 = Object.fromEntries(
    Object.entries(customCodes)
      .filter(([, levelCode]) => !LEGACY_CUSTOM_CODES.includes(levelCode))
      // type is always "smm2" in the old save file!
      .map(([customCode, levelCode]) => [
        customCode,
        { code: levelCode, type: "smm2" },
      ])
  );
  const result = { data, version: CUSTOM_CODES_V2.version };
  return result;
};

const loadCustomCodesV2 = (): ExtensionDataV2<CustomCodesV2> => {
  const fileName = CUSTOM_CODES_V2.fileName;
  const state = ExtensionDataV2(CustomCodesV2).parse(
    JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }))
  );
  if (!CUSTOM_CODES_V2.compatibility.test(state.version)) {
    throw new Error(
      `Custom codes save file ${fileName}: version in file "${state.version}" is not compatible with custom codes save file version "${CUSTOM_CODES_V2.version}". Save file is assumed to be incompatible. Did you downgrade versions?`
    );
  }
  log(`${fileName} has been successfully validated.`);
  return state;
};

export const saveCustomCodesSync = (
  data: Omit<ExtensionDataV2<CustomCodesV2>, "version">,
  errorMessage?: string
) => {
  try {
    writeFileAtomicSync(
      CUSTOM_CODES_V2.fileName,
      createCustomCodesFileContent(data),
      {
        encoding: "utf-8",
      }
    );
  } catch (err) {
    if (errorMessage !== undefined) {
      warn(errorMessage);
    }
    error(
      `${
        CUSTOM_CODES_V2.fileName
      } could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart. ${String(
        err
      )}`
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
  }
};

export const createDataDirectory = () => {
  if (!fs.existsSync(DATA_DIRECTORY)) {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  }
  const extensionsDir = path.join(DATA_DIRECTORY, "extensions");
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
  }
};

export function setup() {
  patchGlobalFs();
  createDataDirectory();
}
