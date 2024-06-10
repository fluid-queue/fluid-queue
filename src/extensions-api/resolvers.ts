import { z } from "zod";
import { Deserialize, EmptyObject, Result, Serialize } from "./helpers.js";
import {
  Entry,
  PersistedEntry,
  PersistedQueueEntry,
  QueueEntry,
  QueueSubmitter,
} from "./queue-entry.js";
import { log } from "../chalk-print.js";
import { ZodTypeUnknown } from "../zod.js";
import { v4 as uuidv4 } from "uuid";

const defaultActivated: string[] = [
  "smm2",
  "customcode",
  "customlevel",
  // "smm1",
  "smm2-lenient",
  "customlevel-name",
];

import i18next from "i18next";

export interface QueueEntryResolver {
  name: string;
  description: string | null;
  resolve(levelCode: string): Result<{ entry: Entry }>;
  resolve(
    levelCode: string,
    submitter: QueueSubmitter
  ): Result<{ entry: QueueEntry }>;
}

export interface QueueEntryDeserializer {
  type: string;
  deserialize(code: string | undefined, data: unknown): Entry;
  deserialize(
    code: string | undefined,
    data: unknown,
    queueData: QueueData
  ): QueueEntry;
}

export interface QueueEntryUpgrade {
  upgrade(levelCode: string): Result<{ entry: PersistedEntry }>;
}

/**
 * private marker
 */
const stageMarker = Symbol("A Stage of QueueEntryApi");

/**
 * private type
 */
type Stage = {
  [stageMarker]: never;
};

export type QueueEntryApi<T extends Stage = CreateStage> = Omit<
  T,
  typeof stageMarker
>;

export interface RegisterStage<T extends object, U extends object = T>
  extends Stage {
  registerResolver(
    name: string,
    resolve: (levelCode: string) => T | null,
    description?: string
  ): QueueEntryApi<RegisterStage<T, U>>;
  registerUpgrade(
    upgrade: (code: string) => U | null
  ): QueueEntryApi<RegisterStage<T, U>>;
}

export interface BuildStage<
  T extends object = EmptyObject,
  A extends unknown[] = [T],
> extends Stage {
  build(display: (...args: A) => string): QueueEntryApi<RegisterStage<T>>;
}

export interface UsingCodeStage<
  S extends Stage = Stage,
  T extends object = EmptyObject,
  A extends unknown[] = [],
> extends Stage {
  usingCode(): QueueEntryApi<
    AdjustStages<S, T & { code: string }, [...A, string]>
  >;
}

export interface UsingDataStage<
  S extends Stage = Stage,
  T extends object = EmptyObject,
  A extends unknown[] = [],
> extends Stage {
  usingData<Data>(
    deserializer: Deserialize<Data>,
    serializer?: Serialize<Data>
  ): QueueEntryApi<AdjustStages<S, T & { data: Data }, [...A, Data]>>;
  usingData<Schema extends ZodTypeUnknown>(
    schema: Schema,
    serializer?: Serialize<z.input<Schema>>
  ): QueueEntryApi<
    AdjustStages<S, T & { data: z.output<Schema> }, [...A, z.output<Schema>]>
  >;
}

type AdjustStages<
  S,
  T extends object,
  A extends unknown[] = [],
> = (S extends UsingCodeStage<infer U> ? UsingCodeStage<U, T, A> : Stage) &
  (S extends UsingDataStage<infer U> ? UsingDataStage<U, T, A> : Stage) &
  (S extends BuildStage ? BuildStage<T, A> : Stage);

type QueueEntryStage = UsingCodeStage<UsingDataStage<BuildStage> & BuildStage> &
  UsingDataStage<UsingCodeStage<BuildStage> & BuildStage> &
  BuildStage;

export interface CreateStage extends Stage {
  queueEntry<Type extends string>(
    type: Type,
    description?: string
  ): QueueEntryApi<QueueEntryStage>;
  anyQueueEntry(
    description?: string
  ): QueueEntryApi<RegisterStage<Entry, PersistedEntry>>;
}

/**
 * Resolvers can only be registered.
 */
export class RegisterResolvers {
  private frozen = false;
  private resolvers: Record<string, QueueEntryResolver> = {};
  private deserializers: Record<string, QueueEntryDeserializer> = {};
  private upgrades: QueueEntryUpgrade[] = [];

  registerResolver(name: string, resolver: QueueEntryResolver) {
    if (this.frozen) {
      throw new Error(
        "Resolvers have to be registered within the setup function!"
      );
    }
    if (name in this.resolvers) {
      throw new Error(`Resolver of name ${name} has been registered already!`);
    }
    this.resolvers[name] = resolver;
  }

  registerDeserializer(type: string, deserializer: QueueEntryDeserializer) {
    if (this.frozen) {
      throw new Error(
        "Deserializers have to be registered within the setup function!"
      );
    }
    if (type in this.deserializers) {
      throw new Error(`Entry of type ${type} has been registered already!`);
    }
    this.deserializers[type] = deserializer;
  }

  registerUpgrade(upgrade: QueueEntryUpgrade) {
    if (this.frozen) {
      throw new Error(
        "Upgrades have to be registered within the setup function!"
      );
    }
    this.upgrades.push(upgrade);
  }

  getRegisteredResolvers(): Record<string, QueueEntryResolver> {
    return this.resolvers;
  }

  getDeserializers(): Record<string, QueueEntryDeserializer> {
    return this.deserializers;
  }

  getUpgrades(): QueueEntryUpgrade[] {
    return this.upgrades;
  }

  freeze() {
    this.frozen = true;
  }

  get api(): QueueEntryApi {
    return {
      anyQueueEntry: (
        globalDescription?: string
      ): QueueEntryApi<RegisterStage<Entry, PersistedEntry>> => {
        const registerResolver = this.registerResolver.bind(this);
        const registerUpgrade = this.registerUpgrade.bind(this);
        return createAnyResolversApi(
          globalDescription,
          registerResolver,
          registerUpgrade
        );
      },
      queueEntry: <Type extends string>(
        type: Type,
        globalDescription?: string
      ): QueueEntryApi<QueueEntryStage> => {
        const registerResolver = this.registerResolver.bind(this);
        const registerDeserializer = this.registerDeserializer.bind(this);
        const registerUpgrade = this.registerUpgrade.bind(this);
        return {
          usingCode() {
            return {
              build(display: (code: string) => string) {
                return createGenericResolversApi<{ code: string }>(
                  type,
                  globalDescription,
                  registerResolver,
                  registerDeserializer,
                  registerUpgrade,
                  ({ code }) => display(code),
                  ({ code }) => {
                    return { code: z.string().parse(code) };
                  },
                  ({ code }) => {
                    return { code, data: undefined };
                  }
                );
              },
              usingData<Data>(
                deserializer: Deserialize<Data> | z.ZodType<Data>,
                serializer: Serialize<Data> | undefined
              ) {
                return {
                  build(display: (code: string, data: Data) => string) {
                    return createGenericResolversApi<{
                      data: Data;
                      code: string;
                    }>(
                      type,
                      globalDescription,
                      registerResolver,
                      registerDeserializer,
                      registerUpgrade,
                      ({ code, data }) => display(code, data),
                      ({ code, data }) => {
                        return {
                          data:
                            deserializer instanceof z.ZodType
                              ? deserializer.parse(data)
                              : deserializer(data),
                          code: z.string().parse(code),
                        };
                      },
                      ({ code, data }) => {
                        return {
                          code: code,
                          data: serializer?.(data) ?? data,
                        };
                      }
                    );
                  },
                };
              },
            };
          },
          usingData<Data>(
            deserializer: Deserialize<Data> | z.ZodType<Data>,
            serializer: Serialize<Data> | undefined
          ) {
            return {
              build(display: (data: Data) => string) {
                return createGenericResolversApi<{ data: Data }>(
                  type,
                  globalDescription,
                  registerResolver,
                  registerDeserializer,
                  registerUpgrade,
                  ({ data }) => display(data),
                  ({ data }) => {
                    return {
                      data:
                        deserializer instanceof z.ZodType
                          ? deserializer.parse(data)
                          : deserializer(data),
                    };
                  },
                  ({ data }) => {
                    return {
                      code: undefined,
                      data: serializer?.(data) ?? data,
                    };
                  }
                );
              },
              usingCode() {
                return {
                  build(display: (data: Data, code: string) => string) {
                    return createGenericResolversApi<{
                      data: Data;
                      code: string;
                    }>(
                      type,
                      globalDescription,
                      registerResolver,
                      registerDeserializer,
                      registerUpgrade,
                      ({ code, data }) => display(data, code),
                      ({ code, data }) => {
                        return {
                          data:
                            deserializer instanceof z.ZodType
                              ? deserializer.parse(data)
                              : deserializer(data),
                          code: z.string().parse(code),
                        };
                      },
                      ({ code, data }) => {
                        return {
                          code: code,
                          data: serializer?.(data) ?? data,
                        };
                      }
                    );
                  },
                };
              },
            };
          },
          build(display: (value: EmptyObject) => string) {
            return createGenericResolversApi<EmptyObject>(
              type,
              globalDescription,
              registerResolver,
              registerDeserializer,
              registerUpgrade,
              display,
              () => {
                return {};
              },
              () => {
                return { code: undefined, data: undefined };
              }
            );
          },
        };
      },
    };
  }
}

export class ConfiguredResolvers implements Iterable<QueueEntryResolver> {
  private available: Record<string, QueueEntryResolver>;
  private activatedOrder: string[];
  private activatedSet: Set<string> = new Set();

  constructor(
    registeredResolvers: Record<string, QueueEntryResolver>,
    configuredResolvers: string[] | null | undefined
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
    log(
      i18next.t("resolversList", {
        activatedOrder: this.activatedOrder,
        style: "short",
        type: "unit",
      })
    );
  }

  get(name: string): QueueEntryResolver | null {
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

function createAnyResolversApi(
  globalDescription: string | undefined,
  registerResolver: (name: string, resolver: QueueEntryResolver) => void,
  registerUpgrade: (upgrade: QueueEntryUpgrade) => void
): QueueEntryApi<RegisterStage<Entry, PersistedEntry>> {
  const api = {
    registerResolver(
      name: string,
      resolve: (levelCode: string) => Entry | null,
      description: string | undefined
    ): QueueEntryApi<RegisterStage<Entry, PersistedEntry>> {
      registerResolver(
        name,
        new QueueEntryAnyResolver(
          name,
          description ?? globalDescription ?? null,
          resolve
        )
      );
      return api;
    },
    registerUpgrade(
      upgrade: (code: string) => PersistedEntry | null
    ): QueueEntryApi<RegisterStage<Entry, PersistedEntry>> {
      registerUpgrade({
        upgrade(levelCode: string) {
          const result = upgrade(levelCode);
          if (result == null) {
            return { success: false };
          }
          return { success: true, entry: result };
        },
      });
      return api;
    },
  };
  return api;
}

export type QueueData = {
  id: string;
  submitter: QueueSubmitter;
  submitted: string;
};

function createGenericResolversApi<T extends object>(
  type: string,
  globalDescription: string | undefined,
  registerResolver: (name: string, resolver: QueueEntryResolver) => void,
  registerDeserializer: (
    type: string,
    deserializer: QueueEntryDeserializer
  ) => void,
  registerUpgrade: (upgrade: QueueEntryUpgrade) => void,
  display: (value: T) => string,
  deserialize: (value: { code: string | undefined; data: unknown }) => T,
  serialize: (value: T) => {
    code: string | undefined;
    data: unknown;
  }
): QueueEntryApi<RegisterStage<T>> {
  function queueEntry(value: T): Entry;
  function queueEntry(value: T, queueData: QueueData): QueueEntry;
  function queueEntry(value: T, queueData?: QueueData): QueueEntry | Entry {
    if (queueData === undefined) {
      return {
        toString() {
          return display(value);
        },
        serializePersistedEntry() {
          const { code, data } = serialize(value);
          return {
            type: type,
            code,
            data,
          };
        },
      };
    }
    const queueEntry: QueueEntry = {
      toString() {
        return display(value);
      },
      serializePersistedQueueEntry() {
        const { code, data } = serialize(value);
        return {
          id: queueData.id,
          submitter: {
            id: queueData.submitter.id,
            name: queueData.submitter.name,
            displayName: queueData.submitter.displayName,
          },
          submitted: queueData.submitted,
          type: type,
          code,
          data,
        };
      },
      serializePersistedEntry() {
        const { code, data } = serialize(value);
        return {
          type: type,
          code,
          data,
        };
      },
      get id() {
        return queueData.id;
      },
      get submitter() {
        return queueData.submitter;
      },
      get submitted() {
        return queueData.submitted;
      },
      rename: (newSubmitter: QueueSubmitter): boolean => {
        if (queueData.submitter.id == newSubmitter.id) {
          const rename =
            queueData.submitter.name != newSubmitter.name ||
            queueData.submitter.displayName != newSubmitter.displayName;
          if (rename) {
            queueData.submitter.name = newSubmitter.name;
            queueData.submitter.displayName = newSubmitter.displayName;
          }
          return rename;
        }
        return false;
      },
    };
    return queueEntry;
  }
  registerDeserializer(
    type,
    new QueueEntryGenericDeserializer<T>(
      type,
      deserialize,
      queueEntry,
      queueEntry
    )
  );
  const api = {
    registerResolver(
      name: string,
      resolve: (levelCode: string) => T | null,
      description: string | undefined
    ): QueueEntryApi<RegisterStage<T>> {
      registerResolver(
        name,
        new QueueEntryGenericResolver<T>(
          name,
          description ?? globalDescription ?? null,
          resolve,
          queueEntry,
          queueEntry
        )
      );
      return api;
    },
    registerUpgrade(
      upgrade: (code: string) => T | null
    ): QueueEntryApi<RegisterStage<T>> {
      registerUpgrade({
        upgrade(levelCode) {
          const result = upgrade(levelCode);
          if (result == null) {
            return { success: false };
          }
          const { code, data } = serialize(result);
          return {
            success: true,
            entry: {
              type: type,
              code,
              data,
            },
          };
        },
      });
      return api;
    },
  };
  return api;
}

class QueueEntryAnyResolver implements QueueEntryResolver {
  name: string;
  description: string | null;
  resolveFn: (levelCode: string) => Entry | null;

  constructor(
    name: string,
    description: string | null,
    resolveFn: (levelCode: string) => Entry | null
  ) {
    this.name = name;
    this.description = description;
    this.resolveFn = resolveFn;
  }

  resolve(levelCode: string): Result<{ entry: Entry }>;
  resolve(
    levelCode: string,
    submitter: QueueSubmitter
  ): Result<{ entry: QueueEntry }>;
  resolve(
    levelCode: string,
    submitter?: QueueSubmitter
  ): Result<{ entry: QueueEntry | Entry }> {
    const resolved = this.resolveFn(levelCode);
    if (resolved != null) {
      if (submitter === undefined) {
        return { success: true, entry: resolved };
      } else {
        const entryId = uuidv4();
        const entrySubmitted = new Date().toISOString();
        const queueEntry: Result<{ entry: QueueEntry }> = {
          success: true,
          entry: {
            ...resolved,
            serializePersistedQueueEntry(): PersistedQueueEntry {
              const resolvedSerialized = resolved.serializePersistedEntry();
              return {
                id: entryId,
                submitter: {
                  id: submitter.id,
                  name: submitter.name,
                  displayName: submitter.displayName,
                },
                submitted: entrySubmitted,
                type: resolvedSerialized.type,
                code: resolvedSerialized.code,
                data: resolvedSerialized.data,
              };
            },
            serializePersistedEntry() {
              return resolved.serializePersistedEntry();
            },
            get id() {
              return entryId;
            },
            get submitter() {
              return submitter;
            },
            get submitted() {
              return entrySubmitted;
            },
            rename: (newSubmitter: QueueSubmitter): boolean => {
              if (submitter.id == newSubmitter.id) {
                const rename =
                  submitter.name != newSubmitter.name ||
                  submitter.displayName != newSubmitter.displayName;
                if (rename) {
                  submitter.name = newSubmitter.name;
                  submitter.displayName = newSubmitter.displayName;
                }
                return rename;
              }
              return false;
            },
          },
        };
        return queueEntry;
      }
    } else {
      return { success: false };
    }
  }
}

class QueueEntryGenericResolver<T> implements QueueEntryResolver {
  name: string;
  description: string | null;
  resolveFn: (levelCode: string) => T | null;
  entry: (value: T) => Entry;
  queueEntry: (value: T, queueData: QueueData) => QueueEntry;

  constructor(
    name: string,
    description: string | null,
    resolveFn: (levelCode: string) => T | null,
    entry: (value: T) => Entry,
    queueEntry: (value: T, queueData: QueueData) => QueueEntry
  ) {
    this.name = name;
    this.description = description;
    this.resolveFn = resolveFn;
    this.entry = entry;
    this.queueEntry = queueEntry;
  }

  resolve(levelCode: string): Result<{ entry: Entry }>;
  resolve(
    levelCode: string,
    submitter: QueueSubmitter
  ): Result<{ entry: QueueEntry }>;
  resolve(
    levelCode: string,
    submitter?: QueueSubmitter
  ): Result<{ entry: QueueEntry | Entry }> {
    const resolved = this.resolveFn(levelCode);
    if (resolved != null) {
      if (submitter === undefined) {
        return { success: true, entry: this.entry(resolved) };
      } else {
        return {
          success: true,
          entry: this.queueEntry(resolved, {
            id: uuidv4(),
            submitter,
            submitted: new Date().toISOString(),
          }),
        };
      }
    } else {
      return { success: false };
    }
  }
}

class QueueEntryGenericDeserializer<T> implements QueueEntryDeserializer {
  type: string;
  deserializeFn: (value: { code: string | undefined; data: unknown }) => T;
  entry: (value: T) => Entry;
  queueEntry: (value: T, queueData: QueueData) => QueueEntry;

  constructor(
    type: string,
    deserializeFn: (value: { code: string | undefined; data: unknown }) => T,
    entry: (value: T) => Entry,
    queueEntry: (value: T, queueData: QueueData) => QueueEntry
  ) {
    this.type = type;
    this.deserializeFn = deserializeFn;
    this.entry = entry;
    this.queueEntry = queueEntry;
  }

  deserialize(code: string | undefined, data: unknown): Entry;
  deserialize(
    code: string | undefined,
    data: unknown,
    queueData: QueueData
  ): QueueEntry;
  deserialize(code: string | undefined, data: unknown, queueData?: QueueData) {
    const value = this.deserializeFn({ code, data });
    if (queueData === undefined) {
      return this.entry(value);
    } else {
      return this.queueEntry(value, queueData);
    }
  }
}
