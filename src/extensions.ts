import * as path from "path";
import { promises as fsPromises } from "fs";
import settings from "./settings.js";
import {
  BindingsApi,
  PersistedBinding,
  SaveHandler,
  TypedBindings,
} from "./extensions-api/queue-binding.js";
import {
  Chatter,
  Commands,
  CommandsApi,
  Responder,
} from "./extensions-api/command.js";
import {
  QueueHandlers,
  QueueHandlersApi,
} from "./extensions-api/queue-handler.js";
import {
  Entry,
  PersistedEntry,
  PersistedQueueEntry,
  QueueEntry,
  QueueSubmitter,
  queueSubmitter,
} from "./extensions-api/queue-entry.js";
import { Result, notNullish } from "./extensions-api/helpers.js";
import {
  ConfiguredResolvers,
  RegisterResolvers,
  QueueEntryDeserializer,
  QueueEntryUpgrade,
  QueueEntryApi,
} from "./extensions-api/resolvers.js";
import { BroadcastOnce, SendOnce } from "./sync.js";
import { fileURLToPath } from "url";

// jest runs on the source, not the build, so this needs to load extensions as typescript too
const fileEnding: string[] = [".js", ".ts"];

// internal interface
interface ExtensionModule<T = Promise<void> | void> {
  setup(api: ExtensionsApi): T;
}

export default interface ExtensionsApi
  extends BindingsApi,
    CommandsApi,
    QueueHandlersApi,
    QueueEntryApi {
  resolve(
    levelCode: string
  ): Result<
    { entry: Entry; description: string | null },
    { descriptions: string[] }
  >;
  /**
   *
   * @param levelCode
   * @param submitter
   */
  resolve(
    levelCode: string,
    submitter: QueueSubmitter
  ): Result<
    { entry: QueueEntry; description: string | null },
    { descriptions: string[] }
  >;
  /**
   * Deserializes the persisted entry with submitter to a queue entry.
   *
   * The {@link QueueEntry} allows you to display (`toString()`), `serialize()` the entry and get the `submitter` of the entry.
   *
   * @param entry The entry from the save file, containing the submitter.
   */
  deserialize(entry: PersistedQueueEntry): QueueEntry;
  /**
   * Deserializes the persisted entry to an entry.
   *
   * The {@link Entry} allows you to display (`toString()`) or `serialize()` the entry.
   *
   * @param entry The entry from the save file.
   */
  deserialize(entry: PersistedEntry): Entry;
  /**
   * Completes the setup and returns a promise that resolves when all extensions completed setup.
   */
  complete(): Promise<void>;
}

function instanceOfExtensionModule(
  module: object
): module is ExtensionModule<unknown> {
  return "setup" in module && typeof module.setup === "function";
}

function mapAnyExtensionModule(
  module: ExtensionModule<unknown>
): ExtensionModule {
  return {
    setup(api): Promise<void> | void {
      const result = module.setup(api);
      if (result instanceof Promise) {
        return result;
      }
    },
  };
}

const loadExtensionModules = async (
  directory: string
): Promise<Record<string, ExtensionModule>> => {
  const result: Record<string, ExtensionModule> = {};

  const files = await fsPromises.readdir(directory);
  const moduleFiles = files.flatMap((fileName) => {
    return fileEnding.flatMap((ext) => {
      if (fileName.endsWith(ext)) {
        return [{ name: fileName.slice(0, -ext.length), fileName }];
      }
      return [];
    });
  });

  const importModules: Promise<{ name: string; module: object }>[] =
    moduleFiles.map(async ({ name, fileName }) => {
      let prefix = "";
      if (process.platform === "win32") {
        prefix = "file://";
      }
      const importName = prefix + path.join(directory, fileName);
      const module = await import(importName);
      return { name, module };
    });
  const modules: { name: string; module: object }[] = await Promise.all(
    importModules
  );

  for (const module of modules) {
    if (instanceOfExtensionModule(module.module)) {
      result[module.name] = mapAnyExtensionModule(module.module);
    } else {
      console.warn(
        `Extension ${module.name} does not declare a setup function and will be ignored.`
      );
    }
  }
  return result;
};

function isPersistedQueueEntry(
  entry: PersistedEntry | PersistedQueueEntry
): entry is PersistedQueueEntry {
  return "submitter" in entry;
}

export class Extensions {
  private registeredResolvers: RegisterResolvers = new RegisterResolvers();
  private configuredResolvers: ConfiguredResolvers | null = null;
  private deserializers: Record<string, QueueEntryDeserializer> | null = null;
  private upgrades: QueueEntryUpgrade[] | null = null;
  private bindings: TypedBindings = new TypedBindings();
  private commands: Commands = new Commands();
  private queueHandlers: QueueHandlers = new QueueHandlers();
  private extensions: Record<string, ExtensionModule> | null = null;

  overrideQueueBindings(bindings: Record<string, PersistedBinding>): void {
    this.bindings.fromPersisted(bindings);
  }
  persistedQueueBindings(): Record<string, PersistedBinding> {
    return this.bindings.toPersisted();
  }
  setQueueBindingSaveHandler(saveHandler: SaveHandler): void {
    this.bindings.setSaveHandler(saveHandler);
  }
  async handleCommands(
    message: string,
    sender: Chatter,
    respond: Responder
  ): Promise<void> {
    return await this.commands.handle(message, sender, respond);
  }
  upgradeEntries(allEntries: PersistedQueueEntry[]): boolean {
    if (this.upgrades == null) {
      throw new Error("Extensions not loaded yet!");
    }
    let changed = false;
    for (const entry of allEntries) {
      if (entry.type == null) {
        // set type to null in case it is undefined
        entry.type = null;
        if (entry.code === undefined) {
          // entry without code can not be upgraded!
          break;
        }
        const code: string = entry.code;
        for (const upgrade of this.upgrades) {
          const result = upgrade.upgrade(code);
          if (result.success) {
            changed ||= true;
            entry.code = result.entry.code;
            entry.data = result.entry.data;
            entry.type = result.entry.type;
          }
        }
      }
    }
    return changed;
  }
  checkEntries(allEntries: QueueEntry[]): boolean {
    return this.queueHandlers.check(allEntries);
  }
  /**
   * loads extensions
   */
  async load() {
    if (this.configuredResolvers != null) {
      console.warn("Extensions already loaded!");
      return;
    }
    // load extensions
    const extensionsPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "extensions"
    );
    this.extensions = await loadExtensionModules(extensionsPath);
    // setup extensions

    const allCompleted = new BroadcastOnce<void>();

    await Promise.all(
      Object.values(this.extensions).map((extension) => {
        const extensionCompleted = new SendOnce<void>();
        const api: ExtensionsApi = {
          ...this.api,
          complete() {
            extensionCompleted.send(void 0);
            return allCompleted.recv();
          },
        };
        // either setup function resolves or `complete()` was called inside the setup function
        return Promise.any([extension.setup(api), extensionCompleted.recv()]);
      })
    );

    console.log(`Extensions: [${Object.keys(this.extensions).join(", ")}]`);
    // load resolvers
    this.registeredResolvers.freeze();
    this.deserializers = this.registeredResolvers.getDeserializers();
    this.upgrades = this.registeredResolvers.getUpgrades();
    this.configuredResolvers = new ConfiguredResolvers(
      this.registeredResolvers.getRegisteredResolvers(),
      settings.resolvers
    );
    allCompleted.send(void 0);
  }
  private displayFallback(entry: PersistedEntry) {
    // try to fallback to code
    if (entry.code == null) {
      // can not display queue entry
      console.error("Can not display queue entry: %s", JSON.stringify(entry));
      return "unknown entry";
    }
    return entry.code;
  }

  deserialize(entry: PersistedQueueEntry): QueueEntry;
  deserialize(entry: PersistedEntry): Entry;
  deserialize(
    entryOrEntries: PersistedEntry | PersistedQueueEntry
  ): Entry | QueueEntry {
    if (this.deserializers == null) {
      throw new Error("Extensions not loaded yet!");
    }
    const entry: PersistedQueueEntry | PersistedEntry = entryOrEntries;
    if (entry.type != null && entry.type in this.deserializers) {
      const deserializer = this.deserializers[entry.type];
      if (isPersistedQueueEntry(entry)) {
        return deserializer.deserialize(
          entry.code,
          entry.data,
          queueSubmitter(entry)
        );
      }
      return deserializer.deserialize(entry.code, entry.data);
    }
    const displayFallback = this.displayFallback.bind(this);
    if (isPersistedQueueEntry(entry)) {
      const queueEntry: QueueEntry = {
        toString() {
          return displayFallback(entry);
        },
        serializePersistedQueueEntry() {
          return entry;
        },
        serializePersistedEntry() {
          return {
            type: entry.type,
            code: entry.code,
            data: entry.data,
          };
        },
        get submitter() {
          return queueSubmitter(entry);
        },
        rename: (newSubmitter: QueueSubmitter): boolean => {
          if (entry.submitter.id == newSubmitter.id) {
            const rename =
              entry.submitter.name != newSubmitter.name ||
              entry.submitter.displayName != newSubmitter.displayName;
            if (rename) {
              entry.submitter.name = newSubmitter.name;
              entry.submitter.displayName = newSubmitter.displayName;
            }
            return rename;
          }
          return false;
        },
      };
      return queueEntry;
    }
    return {
      toString() {
        return displayFallback(entry);
      },
      serializePersistedEntry() {
        return entry;
      },
    };
  }
  resolve(
    levelCode: string,
    submitter: QueueSubmitter
  ): Result<
    { entry: QueueEntry; description: string | null },
    { descriptions: string[] }
  >;
  resolve(
    levelCode: string
  ): Result<
    { entry: Entry; description: string | null },
    { descriptions: string[] }
  >;
  resolve(
    levelCode: string,
    submitter?: QueueSubmitter
  ): Result<
    { entry: QueueEntry | Entry; description: string | null },
    { descriptions: string[] }
  > {
    if (this.configuredResolvers == null) {
      console.warn("Extensions not loaded yet!");
      return { success: false, descriptions: [] };
    }
    const descriptions: Set<string> = new Set();
    // check if args start with a resolver name
    const levelCodeArgs = levelCode.trim().split(/\s+/);
    const [resolverName] = levelCodeArgs;
    let [, ...resolverArgs] = levelCodeArgs;
    const resolver = this.configuredResolvers.get(resolverName);
    if (resolver != null) {
      let result;
      if (submitter === undefined) {
        result = resolver.resolve(resolverArgs.join(" "));
      } else {
        result = resolver.resolve(resolverArgs.join(" "), submitter);
      }
      if (result.success) {
        return {
          success: true,
          entry: result.entry,
          description: resolver.description,
        };
      }
      return {
        success: false,
        descriptions: [resolver.description].filter(notNullish),
      };
    }
    resolverArgs = levelCodeArgs;
    // run all resolvers in order until first one resolves otherwise
    for (const resolver of this.configuredResolvers) {
      let result;
      if (submitter === undefined) {
        result = resolver.resolve(resolverArgs.join(" "));
      } else {
        result = resolver.resolve(resolverArgs.join(" "), submitter);
      }
      if (result.success) {
        return {
          success: true,
          entry: result.entry,
          description: resolver.description,
        };
      }
      if (resolver.description != null) {
        descriptions.add(resolver.description);
      }
    }
    return {
      success: false,
      descriptions: [...descriptions],
    };
  }

  get api(): Omit<ExtensionsApi, "complete"> {
    return {
      ...this.registeredResolvers.api,
      ...this.bindings.api,
      ...this.commands.api,
      ...this.queueHandlers.api,
      resolve: this.resolve.bind(this),
      deserialize: this.deserialize.bind(this),
    };
  }
}
