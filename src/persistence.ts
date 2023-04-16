import settings from "./settings.js";
import fs from "fs";
import gracefulFs from "graceful-fs";
import writeFileAtomic, {
  sync as writeFileAtomicSync,
} from "write-file-atomic";
import { Waiting, WaitingSchemeV2, WaitingV2 } from "./waiting.js";
import path from "path";
import { z } from "zod";

const DATA_DIRECTORY = "data";
const QUEUE_V2 = {
  fileName: path.join(DATA_DIRECTORY, "queue.json"),
  version: "2.2", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
};
const CUSTOM_CODES_V2 = {
  fileName: path.join(DATA_DIRECTORY, "extensions", "customcode.json"),
  version: "2.0", // increase major version if data format changes in a way that is not understood by a previous version of the queue
  compatibility: /^2(\.|$)/, // the version that is being accepted
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
  data: z.any().optional(),
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

function ExtensionDataV2<ItemType extends z.ZodTypeAny>(itemSchema: ItemType) {
  return z.object({
    version: z
      .string()
      .describe(
        "the version of the extension data; independant from the queue save file version and npm version"
      ),
    data: itemSchema.describe("the data associated with the extension"),
  });
}

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
    .record(z.string().describe("the extension name"), ExtensionDataV2(z.any()))
    .default({}),
});
type QueueV2 = z.infer<typeof QueueV2>;

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
      const fileContents = JSON.parse(
        fs.readFileSync(fileName, { encoding: "utf8" })
      );
      console.log(`${fileName} has been successfully validated.`);
      return parse(fileContents);
    } catch (err) {
      if (errorMessage != null) {
        console.warn(
          "An error occurred when trying to load %s. %s",
          fileName,
          errorMessage,
          err
        );
      } else {
        console.warn(
          "An error occurred when trying to load %s.",
          fileName,
          err
        );
      }
      // let it crash!
      throw err;
    }
  }
  return newContent;
}

const loadQueueV1 = (): QueueV2 => {
  const now = new Date().toISOString();
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
      console.warn(`Usernames are not set in the file ${QUEUE_V1.queso}!`);
      console.warn(
        "Assuming that usernames are lowercase Display Names, which does not work with Localized Display Names."
      );
      console.warn("To be safe, clear the queue with !clear.");
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
      waiting[level.username] = Waiting.create(now).toJson();
    }
  });
  return {
    version: QUEUE_V2.version,
    currentLevel,
    queue: levelsV2,
    waiting,
    extensions: {},
  };
};

const upgradeWaiting = (
  waitingUsers: WaitingUsersV1,
  userWaitTime: UserWaitTimeV1,
  userOnlineTime: UserOnlineTimeV1,
  now?: string
): Record<string, WaitingV2> => {
  now = now ?? new Date().toISOString();
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

const loadQueueV2 = (): QueueV2 => {
  const fileName = QUEUE_V2.fileName;
  const state = QueueV2.parse(
    JSON.parse(fs.readFileSync(fileName, { encoding: "utf8" }))
  );
  if (!QUEUE_V2.compatibility.test(state.version)) {
    throw new Error(
      `Queue save file ${fileName}: version in file "${state.version}" is not compatible with queue save file version "${QUEUE_V2.version}". Save file is assumed to be incompatible. Did you downgrade versions?`
    );
  }
  console.log(`${fileName} has been successfully validated.`);
  return state;
};

const emptyQueue = (): QueueV2 => {
  return {
    version: QUEUE_V2.version,
    currentLevel: null,
    queue: [],
    waiting: {},
    extensions: {},
  };
};

const emptyCustomCodes = (): ExtensionDataV2<CustomCodesV2> => {
  return {
    version: CUSTOM_CODES_V2.version,
    data: {},
  };
};

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
        console.log(`${file} is no longer needed and can be deleted.`);
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
    console.log(
      `${descriptorVersion2.fileName} has been successfully created from ${filesDescription}.`
    );
    const dataVersion2 = loadVersion2();
    // at this point assume everything was converted successfully (an error would have been thrown instead)
    // now delete version 1 files
    Object.values(filesVersion1).forEach((file) => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`${file} has been deleted successfully.`);
        } catch (err) {
          console.warn("%s could not be deleted.", file, err);
          // this error can be safely ignored!
        }
      }
    });
    return dataVersion2;
  }
  // create an empty save file
  const createdVersion2 = createVersion2();
  saveVersion2(createdVersion2);
  console.log(`${descriptorVersion2.fileName} has been successfully created.`);
  return loadVersion2();
}

export const loadQueueSync = (): QueueV2 => {
  return loadSync<QueueV2>(
    QUEUE_V2,
    loadQueueV2,
    saveQueueSync,
    emptyQueue,
    QUEUE_V1,
    loadQueueV1
  );
};

const createSaveFileContent = (
  queue: Omit<z.input<typeof QueueV2>, "version">
) => {
  return JSON.stringify(
    {
      ...queue,
      version: QUEUE_V2.version,
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
  data: Omit<z.input<typeof QueueV2>, "version">
) => {
  try {
    writeFileAtomicSync(QUEUE_V2.fileName, createSaveFileContent(data));
    return true;
  } catch (err) {
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      QUEUE_V2.fileName,
      err
    );
    // ignore this error and keep going
    // hopefully this issue is gone on the next save
    // or maybe even solved by the user while the queue keeps running, e.g. not enough space on disk
    return false;
  }
};

export const saveQueue = async (
  data: Omit<z.input<typeof QueueV2>, "version">
) => {
  try {
    await new Promise<void>((resolve, reject) =>
      writeFileAtomic(
        QUEUE_V2.fileName,
        createSaveFileContent(data),
        (error) => {
          if (error == null) {
            resolve();
          } else {
            reject(error);
          }
        }
      )
    );
    return true;
  } catch (err) {
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      QUEUE_V2.fileName,
      err
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
  console.log(`${fileName} has been successfully validated.`);
  return state;
};

export const saveCustomCodesSync = (
  data: Omit<ExtensionDataV2<CustomCodesV2>, "version">,
  errorMessage?: string
) => {
  try {
    writeFileAtomicSync(
      CUSTOM_CODES_V2.fileName,
      createCustomCodesFileContent(data)
    );
  } catch (err) {
    if (errorMessage !== undefined) {
      console.warn(errorMessage);
    }
    console.error(
      "%s could not be saved. The queue will keep running, but the state is not persisted and might be lost on restart.",
      CUSTOM_CODES_V2.fileName,
      err
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
