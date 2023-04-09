import * as path from "path";
import { promises as fsPromises } from "fs";
import settings from "./settings";
import { aliases as aliasesFunction } from "./aliases";
const aliases = aliasesFunction();

// jest runs on the source, not the build, so this needs to load extensions as typescript too
const fileEnding: string[] = [".js", ".ts"];

const defaultActivated: string[] = [
  "smm2",
  "customcode",
  "customlevel",
  // "smm1",
  "smm2-lenient",
  "customlevel-name",
];

// internal interface
interface ExtensionModule {
  setup(api: ExtensionsApi): Promise<void> | void;
}

export interface ResolveResult extends Record<string, unknown> {
  type: string;
  /**
   * if code is undefined => code is deleted!
   */
  code?: string;
}

export interface CodeResolver {
  description?: string;
  resolve(code: string): ResolveResult | null;
}

export type SaveHandler = (name?: string) => void;

export interface PersistedBinding {
  data?: unknown;
  version: string;
}

export interface TypedBinding<Data, Transient> {
  data: Data;
  transient: Transient;
  save(): void;
}

interface BindingOperations {
  fromPersisted(value: PersistedBinding): void;
  toPersisted(): PersistedBinding;
  clear(): void;
}

// eslint-disable-next-line @typescript-eslint/ban-types
type FunctionOrData<
  Type,
  Arguments extends unknown[]
> = Type extends () => unknown
  ? (...args: Arguments) => Type
  : ((...args: Arguments) => Type) | Type;

export interface BindingDescription<Data, Transient> {
  name: string;

  empty: FunctionOrData<Data, []>;
  initialize: FunctionOrData<Transient, [Data]>;

  serialize(data: Data, transient: Transient): PersistedBinding;
  deserialize(value: PersistedBinding): Data;
}

interface TypeBindingBuilder<Data, Transient> {
  build(value?: PersistedBinding): { data: Data; transient: Transient };
  update(
    binding: TypedBinding<Data, Transient>,
    value?: PersistedBinding
  ): void;
}

export interface ObjectBinding {
  data: object;
  version: string;
  transient: unknown | null;
  save(): void;
}

/**
 * All properties of type T are required and not null
 */
type NonNullableRequired<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
};

export type Responder = (message: string) => void;

// TODO: move this somewhere else!
export interface Chatter {
  username: string;
  displayName: string;
  isSubscriber: boolean;
  isMod: boolean;
  isBroadcaster: boolean;
}

export interface CommandHandler {
  aliases: string[];
  handle(message: string, sender: Chatter, respond: Responder): Promise<void>;
}

export interface QueueSubmitter {
  username: string;
  submitter: string;
}

export interface QueueEntry extends Record<string, unknown>, QueueSubmitter {
  code?: string;
  type: string | null;
}

export type DisplayEntry = NonNullableRequired<
  Pick<QueueEntry, "code" | "type">
> &
  Partial<QueueEntry>;

export interface EntryType {
  display(entry: DisplayEntry): string;
}

export interface QueueHandler {
  upgrade?(code: string): ResolveResult | null;
  check?(allEntried: QueueEntry[]): boolean;
}

export interface ResolversApi {
  registerResolver(name: string, resolver: CodeResolver): void;
}

export interface BindingsApi {
  createQueueBinding<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypedBinding<Data, Transient>;
}

export interface CommandsApi {
  registerCommand(name: string, handler: CommandHandler): void;
}

export interface QueueHandlersApi {
  registerQueueHandler(queueHandler: QueueHandler): void;
}

export default interface ExtensionsApi
  extends ResolversApi,
    BindingsApi,
    CommandsApi,
    QueueHandlersApi {
  registerEntryType(name: string, entryType: EntryType): void;
  resolve(
    levelCode: string
  ):
    | { entry: ResolveResult; description: string | null }
    | { descriptions: string[] };
  display(entry: Partial<QueueEntry>): string;
}

function instanceOfExtensionModule(module: object): module is ExtensionModule {
  return "setup" in module && typeof module.setup === "function";
}

const loadExtensionModules = async (
  directory: string
): Promise<Record<string, ExtensionModule>> => {
  const result: Record<string, ExtensionModule> = {};

  const files = await fsPromises.readdir(directory);
  const moduleNames = files.flatMap((file) => {
    return fileEnding.flatMap((ext) => {
      if (file.endsWith(ext)) {
        return [file.slice(0, -ext.length)];
      }
      return [];
    });
  });

  const importModules: Promise<{ name: string; module: object }>[] =
    moduleNames.map(async (name) => {
      const importName = path.join(directory, name);
      const module = await import(importName);
      return { name, module };
    });
  const modules: { name: string; module: object }[] = await Promise.all(
    importModules
  );

  for (const module of modules) {
    if (instanceOfExtensionModule(module.module)) {
      result[module.name] = module.module;
    } else {
      console.warn(
        `Extension ${module.name} does not declare a setup function and will be ignored.`
      );
    }
  }
  return result;
};

/**
 * Resolvers can only be registered.
 */
class RegisterResolvers {
  private registered: Record<string, CodeResolver> = {};

  register(name: string, resolver: CodeResolver) {
    this.registered[name] = resolver;
  }

  registeredResolvers() {
    return this.registered;
  }
}

class ConfiguredResolvers implements Iterable<CodeResolver> {
  private available: Record<string, CodeResolver>;
  private activatedOrder: string[];
  private activatedSet: Set<string> = new Set();

  constructor(
    registeredResolvers: Record<string, CodeResolver>,
    configuredResolvers: string[] | null
  ) {
    if (configuredResolvers != null) {
      this.activatedOrder = configuredResolvers;
    } else {
      this.activatedOrder = defaultActivated;
    }
    this.available = registeredResolvers;
    this.activatedOrder = this.activatedOrder.filter(
      (activated) => activated in this.available
    );
    this.activatedOrder.forEach((activated) =>
      this.activatedSet.add(activated)
    );
    console.log(`Resolvers: [${this.activatedOrder.join(", ")}]`);
  }

  get(name: string): CodeResolver | null {
    if (name in this.available && this.activatedSet.has(name)) {
      return this.available[name];
    }
    return null;
  }

  *[Symbol.iterator]() {
    for (const name of this.activatedOrder) {
      if (name in this.available) {
        yield this.available[name];
      }
    }
  }
}

class TypedBindings {
  private persistedBindings: Record<string, PersistedBinding> = {};
  private typeBindings: Record<string, BindingOperations> = {};
  private saveHandler: SaveHandler | null = null;
  private save(name: string) {
    if (this.saveHandler == null) {
      console.warn(
        `extension ${name} requested to save, but no save handler is registered`
      );
      return;
    }
    this.saveHandler(name);
  }
  setSaveHandler(saveHandler: SaveHandler) {
    this.saveHandler = saveHandler;
  }
  createTypeBindingBuilder<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypeBindingBuilder<Data, Transient> {
    const buildData = (value?: PersistedBinding) => {
      if (value != null) {
        return description.deserialize(value);
      }
      if (typeof description.empty === "function") {
        return description.empty();
      } else {
        return description.empty;
      }
    };
    const buildTransient = (data: Data) => {
      if (typeof description.initialize === "function") {
        return description.initialize(data);
      } else {
        return description.initialize;
      }
    };
    return {
      build(value?: PersistedBinding) {
        const data = buildData(value);
        const transient = buildTransient(data);
        return { data, transient };
      },
      update(binding: TypedBinding<Data, Transient>, value?: PersistedBinding) {
        const { data, transient } = this.build(value);
        binding.data = data;
        binding.transient = transient;
      },
    };
  }
  createTypeBinding<Data, Transient>(
    description: BindingDescription<Data, Transient>
  ): TypedBinding<Data, Transient> {
    if (description.name in this.typeBindings) {
      throw new Error(
        `Type binding of name ${description.name} already exists!`
      );
    }
    const builder = this.createTypeBindingBuilder(description);
    const { data, transient } = builder.build();
    const binding = {
      data,
      transient,
      save: this.save.bind(this, description.name),
      fromPersisted(value: PersistedBinding) {
        builder.update(this, value);
      },
      toPersisted(): PersistedBinding {
        return description.serialize(this.data, this.transient);
      },
      clear() {
        builder.update(this);
      },
    };
    this.typeBindings[description.name] = binding;
    return binding;
  }
  fromPersisted(newBindings: Record<string, PersistedBinding>) {
    this.persistedBindings = newBindings;
    // update bindings
    for (const [name, value] of Object.entries(this.typeBindings)) {
      if (name in this.persistedBindings) {
        value.fromPersisted(this.persistedBindings[name]);
      } else {
        value.clear();
      }
    }
  }
  toPersisted(): Record<string, PersistedBinding> {
    // update persisted data
    for (const [name, value] of Object.entries(this.typeBindings)) {
      this.persistedBindings[name] = value.toPersisted();
    }
    return this.persistedBindings;
  }

  get api(): BindingsApi {
    return {
      createQueueBinding: this.createTypeBinding.bind(this),
    };
  }
}

class Commands {
  private handlers: Record<string, CommandHandler> = {};
  register(name: string, handler: CommandHandler): void {
    this.handlers[name] = handler;
    aliases.addDefault(name, handler.aliases);
  }
  private getRemainder(s: string): string {
    const index = s.indexOf(" ");
    if (index == -1) {
      return "";
    }
    return s.substring(index + 1);
  }
  async handle(
    message: string,
    sender: Chatter,
    respond: Responder
  ): Promise<void> {
    for (const name in this.handlers) {
      if (aliases.isAlias(name, message)) {
        const handler = this.handlers[name];
        return await handler.handle(
          this.getRemainder(message),
          sender,
          respond
        );
      }
    }
  }
  get api(): CommandsApi {
    return {
      registerCommand: this.register.bind(this),
    };
  }
}

class QueueHandlers {
  private handlers: QueueHandler[] = [];
  register(handler: QueueHandler) {
    this.handlers.push(handler);
  }
  upgrade(allEntries: Partial<QueueEntry>[]): boolean {
    let changed = false;
    for (const entry of allEntries) {
      if (entry.type == null) {
        // set type to null in case it is undefined
        entry.type = null;
        if (entry.code === undefined) {
          // entry without code can not be upgraded!
          break;
        }
        // upgrade entry
        for (const handler of this.handlers) {
          if (handler.upgrade != null) {
            const result = handler.upgrade(entry.code);
            if (result != null) {
              Object.entries(result).forEach(
                ([name, value]) => (entry[name] = value)
              );
              changed = true;
              break;
            }
          }
        }
      }
    }
    return changed;
  }

  check(allEntries: QueueEntry[]): boolean {
    let changed = false;
    for (const handler of this.handlers) {
      if (handler.check != null) {
        changed = handler.check(allEntries) || changed;
      }
    }
    return changed;
  }

  get api(): QueueHandlersApi {
    return {
      registerQueueHandler: this.register.bind(this),
    };
  }
}

export class Extensions {
  private resolvers: RegisterResolvers | ConfiguredResolvers =
    new RegisterResolvers();
  private bindings: TypedBindings = new TypedBindings();
  private commands: Commands = new Commands();
  private queueHandlers: QueueHandlers = new QueueHandlers();
  private entryTypes: Record<string, EntryType> = {};
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
  upgradeEntries(allEntries: Partial<QueueEntry>[]): boolean {
    return this.queueHandlers.upgrade(allEntries);
  }
  checkEntries(allEntries: QueueEntry[]): boolean {
    return this.queueHandlers.check(allEntries);
  }
  /**
   * loads extensions
   */
  async load() {
    if (!(this.resolvers instanceof RegisterResolvers)) {
      console.warn("Extensions already loaded!");
      return;
    }
    // load extensions
    const extensionsPath = path.resolve(__dirname, "extensions");
    this.extensions = await loadExtensionModules(extensionsPath);
    // setup extensions
    await Promise.all(
      Object.values(this.extensions).map((extension) =>
        Promise.resolve(extension.setup(this.api))
      )
    );

    console.log(`Extensions: [${Object.keys(this.extensions).join(", ")}]`);
    // load resolvers
    this.resolvers = new ConfiguredResolvers(
      this.resolvers.registeredResolvers(),
      settings.resolvers ?? null
    );
  }
  registerEntryType(name: string, entryType: EntryType) {
    this.entryTypes[name] = entryType;
  }
  private displayFallback(entry: Partial<QueueEntry>) {
    // try to fallback to code
    if (entry.code == null) {
      // can not display queue entry
      console.error("Can not display queue entry: %s", JSON.stringify(entry));
      return "unknown entry";
    }
    return entry.code;
  }
  private hasCodeAndType(
    entry: Partial<QueueEntry>
  ): entry is NonNullableRequired<Pick<QueueEntry, "code" | "type">> {
    return entry.code != null && entry.type != null;
  }
  display(entry: Partial<QueueEntry>) {
    if (this.hasCodeAndType(entry) && entry.type in this.entryTypes) {
      const entryType = this.entryTypes[entry.type];
      return entryType.display(entry);
    }
    return this.displayFallback(entry);
  }
  // TODO: move this to utility
  private notNullish<T>(value: T | null | undefined): value is T {
    return value != null;
  }
  resolve(
    levelCode: string
  ):
    | { entry: ResolveResult; description: string | null }
    | { descriptions: string[] } {
    if (!(this.resolvers instanceof ConfiguredResolvers)) {
      console.warn("Extensions not loaded yet!");
      return { descriptions: [] };
    }
    const descriptions: Set<string> = new Set();
    // check if args start with a resolver name
    const levelCodeArgs = levelCode.trim().split(/\s+/);
    const [resolverName] = levelCodeArgs;
    let [, ...resolverArgs] = levelCodeArgs;
    const resolver = this.resolvers.get(resolverName);
    if (resolver != null) {
      const entry = resolver.resolve(resolverArgs.join(" "));
      if (entry != null) {
        return { entry, description: resolver.description ?? null };
      }
      return {
        descriptions: [resolver.description].filter(this.notNullish.bind(this)),
      };
    }
    resolverArgs = levelCodeArgs;
    // run all resolvers in order until first one resolves otherwise
    for (const resolver of this.resolvers) {
      const entry = resolver.resolve(resolverArgs.join(" "));
      if (entry != null) {
        return {
          entry,
          description: resolver.description ?? null,
        };
      }
      if (resolver.description != null) {
        descriptions.add(resolver.description);
      }
    }
    return {
      descriptions: [...descriptions],
    };
  }

  get api(): ExtensionsApi {
    return {
      ...this.bindings.api,
      ...this.commands.api,
      ...this.queueHandlers.api,
      registerResolver: (name, resolver) => {
        // can not bind this.resolvers since the value can change
        if (this.resolvers instanceof RegisterResolvers) {
          return this.resolvers.register(name, resolver);
        } else {
          throw new Error(
            "Resolvers have to be registered within the setup function!"
          );
        }
      },
      registerEntryType: this.registerEntryType.bind(this),
      resolve: this.resolve.bind(this),
      display: this.display.bind(this),
    };
  }
}
