import ExtensionsApi from "../extensions.js";
import settings from "../settings.js";
// TODO: move persistence functionality into extensions API
import * as persistence from "../persistence.js";
import { Entry, PersistedEntry } from "../extensions-api/queue-entry.js";
import { Result } from "../extensions-api/helpers.js";
import { Chatter } from "../extensions-api/command.js";
import i18next from "i18next";

await (await import("./helpers/i18n.js")).init("customcode", import.meta.url);

class CustomCodes {
  map: Map<string, { customCode: string; entry: Entry }> = new Map<
    string,
    { customCode: string; entry: Entry }
  >();
  reload: () => void = () => {
    /* does nothing at the start, but will be overriden by customCodes.fromObject */
  };

  has(customCodeArg: string): boolean {
    const customCode = customCodeArg.trim();
    return this.map.has(customCode.toUpperCase());
  }
  getEntry(customCodeArg: string): Entry | null {
    const customCode = customCodeArg.trim();
    return this.map.get(customCode.toUpperCase())?.entry ?? null;
  }
  getName(customCodeArg: string): string | null {
    const customCode = customCodeArg.trim();
    return this.map.get(customCode.toUpperCase())?.customCode ?? null;
  }
  listNames(): string[] {
    return [...this.map.values()].map((e) => e.customCode);
  }
  set(customCodeArg: string, entry: Entry): void {
    const customCode = customCodeArg.trim();
    this.map.set(customCode.toUpperCase(), { customCode, entry });
  }
  delete(customCodeArg: string): boolean {
    const customCode = customCodeArg.trim();
    return this.map.delete(customCode.toUpperCase());
  }
  fromObject(
    customCodesObject: persistence.CustomCodesV2,
    deserialize: (level: PersistedEntry) => Entry
  ) {
    this.reload = () => {
      this.fromObject(customCodesObject, deserialize);
    };
    const entries: [string, { customCode: string; entry: Entry }][] =
      Object.entries(customCodesObject).map(
        ([customCode, entry]): [
          string,
          { customCode: string; entry: Entry },
        ] => [
          customCode.toUpperCase(),
          { customCode, entry: deserialize(entry) },
        ]
      );
    this.map = new Map(entries);
  }
  toObject(): persistence.CustomCodesV2 {
    return Object.fromEntries(
      [...this.map.values()].map((e) => [
        e.customCode,
        e.entry.serializePersistedEntry(),
      ])
    );
  }
}

const customCodes = new CustomCodes();

function resolver(args: string): Entry | null {
  if (customCodes.has(args)) {
    return customCodes.getEntry(args);
  }
  return null;
}

const commandHandler = (
  resolveLevel: (
    levelCode: string
  ) => Result<
    { entry: Entry; description: string | null },
    { descriptions: string[] }
  >,
  deserialize: (level: PersistedEntry) => Entry
) => {
  return {
    aliases: ["!customcode", "!customcodes"],
    handle(
      message: string,
      sender: Chatter,
      respond: (message: string) => void
    ) {
      if (sender.isBroadcaster) {
        if (message == "") {
          respond(this.customCodes());
        } else {
          respond(this.customCodeManagement(message));
        }
      } else {
        respond(this.customCodes());
      }
    },
    customCodes() {
      const list = customCodes.listNames();
      if (list.length == 0) {
        return i18next.t("noCodes", { ns: "customcode" });
      } else {
        return i18next.t("currentCodes", {
          ns: "customcode",
          codes: list,
          style: "short",
          type: "unit",
        });
      }
    },
    customCodeManagement(codeArguments: string) {
      const save = (errorMessage: string) => {
        persistence.saveCustomCodesSync(
          { data: customCodes.toObject() },
          errorMessage
        );
      };
      const [command, ...rest] = codeArguments.split(" ");
      if (command == "add" && rest.length >= 2) {
        const [customName, ...realName] = rest;
        const resolved = resolveLevel(realName.join(" "));
        if (!resolved.success) {
          return i18next.t("invalidCode", { ns: "customcode" });
        }

        if (customCodes.has(customName)) {
          const existingName = customCodes.getName(customName);
          return i18next.t("alreadyExists", {
            ns: "customcode",
            customName: existingName,
          });
        }
        customCodes.set(customName, resolved.entry);
        save("An error occurred while trying to add your custom code.");
        return i18next.t("codeAdded", {
          ns: "customcode",
          customName,
          code: resolved.entry,
        });
      } else if (command == "remove" && rest.length == 1) {
        const [customName] = rest;
        if (!customCodes.has(customName)) {
          return i18next.t("notFound", { ns: "customcode", customName });
        }
        const deletedName = customCodes.getName(customName);
        const deletedEntry = customCodes.getEntry(customName);
        if (deletedEntry == null) {
          return i18next.t("notFound", { ns: "customcode", customName });
        }

        if (!customCodes.delete(customName)) {
          save(i18next.t("removeError", { ns: "customcode" }));
          return i18next.t("codeNotRemoved", {
            ns: "customcode",
            deletedName,
            deletedEntry,
          });
        }
        save(i18next.t("removeError", { ns: "customcode" }));
        return i18next.t("codeRemoved", {
          ns: "customcode",
          deletedName,
          deletedEntry,
        });
      } else if (
        (command == "load" || command == "reload" || command == "restore") &&
        rest.length == 0
      ) {
        this.loadCustomCodes();
        return i18next.t("codesReloaded", { ns: "customcode" });
      } else {
        return i18next.t("syntax", { ns: "customcode" });
      }
    },
    loadCustomCodes() {
      // Check if custom codes are enabled and, if so, validate that the correct files exist.
      if (settings.custom_codes_enabled) {
        const customCodesObject = persistence.loadCustomCodesSync().data;
        customCodes.fromObject(customCodesObject, deserialize);
      } else {
        // only custom levels will function
        customCodes.fromObject({}, deserialize);
      }
    },
  };
};

export async function setup(api: ExtensionsApi): Promise<void> {
  api.anyQueueEntry("custom code").registerResolver("customcode", resolver);
  const handler = commandHandler(
    (levelCode: string) => api.resolve(levelCode),
    (level: PersistedEntry): Entry => api.deserialize(level)
  );
  api.registerCommand("customcode", handler);
  await api.complete();
  handler.loadCustomCodes();
}
