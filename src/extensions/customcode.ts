import ExtensionsApi, {
  ResolveResult,
  QueueEntry,
  Chatter,
} from "../extensions";
import settings from "../settings";
// TODO: move persistence functionality into extensions API
import * as persistence from "../persistence";

class CustomCodes {
  map: Map<
    string,
    { customCode: string; entry: persistence.CustomCodesEntryV2 }
  > = new Map<
    string,
    { customCode: string; entry: persistence.CustomCodesEntryV2 }
  >();
  reload: () => void = () => {
    /* does nothing at the start, but will be overriden by customCodes.fromObject */
  };

  has(customCodeArg: string): boolean {
    const customCode = customCodeArg.trim();
    return this.map.has(customCode.toUpperCase());
  }
  getEntry(customCodeArg: string): persistence.CustomCodesEntryV2 | null {
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
  set(customCodeArg: string, entry: persistence.CustomCodesEntryV2): void {
    const customCode = customCodeArg.trim();
    this.map.set(customCode.toUpperCase(), { customCode, entry });
  }
  delete(customCodeArg: string): boolean {
    const customCode = customCodeArg.trim();
    return this.map.delete(customCode.toUpperCase());
  }
  fromObject(customCodesObject: persistence.CustomCodesV2) {
    this.reload = () => {
      this.fromObject(customCodesObject);
    };
    const entries: [
      string,
      { customCode: string; entry: persistence.CustomCodesEntryV2 }
    ][] = Object.entries(customCodesObject).map(
      ([customCode, entry]): [
        string,
        { customCode: string; entry: persistence.CustomCodesEntryV2 }
      ] => [customCode.toUpperCase(), { customCode, entry }]
    );
    this.map = new Map(entries);
  }
  toObject(): persistence.CustomCodesV2 {
    return Object.fromEntries(
      [...this.map.values()].map((e) => [e.customCode, e.entry])
    );
  }
}

const customCodes = new CustomCodes();

const resolver = {
  description: "custom code",
  resolve(args: string): ResolveResult | null {
    if (customCodes.has(args)) {
      return customCodes.getEntry(args);
    }
    return null;
  },
};

const commandHandler = (
  resolveLevel: (
    code: string
  ) =>
    | { entry: ResolveResult; description: string | null }
    | { descriptions: string[] },
  displayLevel: (entry: Partial<QueueEntry>) => string
) => {
  return {
    aliases: ["!customcode", "!customcodes"],
    async handle(
      message: string,
      sender: Chatter,
      respond: (message: string) => void
    ) {
      if (sender.isBroadcaster) {
        if (message == "") {
          respond(this.customCodes());
        } else {
          respond(await this.customCodeManagement(message));
        }
      } else {
        respond(this.customCodes());
      }
    },
    customCodes() {
      const list = customCodes.listNames();
      if (list.length == 0) {
        return "There are no custom codes set.";
      } else {
        const response = list.join(", ");
        return "The current custom codes are: " + response + ".";
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
        if (!("entry" in resolved)) {
          return "That is an invalid level code.";
        }

        if (customCodes.has(customName)) {
          const existingName = customCodes.getName(customName);
          return `The custom code ${existingName} already exists`;
        }
        let code: string | undefined;
        if (resolved.entry.code === undefined) {
          code = realName.join(" ");
        } else if (typeof resolved.entry.code === "string") {
          code = resolved.entry.code;
        } else {
          code = undefined;
        }
        customCodes.set(customName, { ...resolved.entry, code });
        save("An error occurred while trying to add your custom code.");
        return `Your custom code ${customName} for ${displayLevel(
          resolved.entry
        )} has been added.`;
      } else if (command == "remove" && rest.length == 1) {
        const [customName] = rest;
        if (!customCodes.has(customName)) {
          return `The custom code ${customName} could not be found.`;
        }
        const deletedName = customCodes.getName(customName);
        const deletedEntry = customCodes.getEntry(customName);
        if (deletedEntry == null) {
          return `The custom code ${customName} could not be found.`;
        }

        if (!customCodes.delete(customName)) {
          save("An error occurred while trying to remove that custom code.");
          return `The custom code ${deletedName} for ${displayLevel(
            deletedEntry
          )} could not be deleted.`;
        }
        save("An error occurred while trying to remove that custom code.");
        return `The custom code ${deletedName} for ${displayLevel(
          deletedEntry
        )} has been removed.`;
      } else if (
        (command == "load" || command == "reload" || command == "restore") &&
        rest.length == 0
      ) {
        this.loadCustomCodes();
        return "Reloaded custom codes from disk.";
      } else {
        return "Invalid arguments. The correct syntax is !customcode {add/remove/load} {customCode} {ID}.";
      }
    },
    loadCustomCodes() {
      // Check if custom codes are enabled and, if so, validate that the correct files exist.
      if (settings.custom_codes_enabled) {
        const customCodesObject = persistence.loadCustomCodesSync().data;
        customCodes.fromObject(customCodesObject);
      } else {
        // only custom levels will function
        customCodes.fromObject({});
      }
    },
  };
};

const setup = (api: ExtensionsApi) => {
  api.registerResolver("customcode", resolver);
  const handler = commandHandler(
    (code: string) => api.resolve(code),
    (level: Partial<QueueEntry>) => api.display(level)
  );
  api.registerCommand("customcode", handler);
  handler.loadCustomCodes();
};

module.exports = {
  setup,
};
