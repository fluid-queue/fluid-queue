import fs from "fs";
import { sync as writeFileAtomicSync } from "write-file-atomic";
import settings from "./settings.js";
import { z } from "zod";

const ALIASES_FILE = {
  directory: "./settings",
  fileName: "./settings/aliases.json",
};

const AliasesScheme = z.record(z.string().array());

const defaultAliases: Record<string, string[]> = {
  add: ["!add"],
  back: ["!back"],
  brb: ["!brb", "!lurk"],
  clear: ["!clear"],
  close: ["!close"],
  current: ["!current"],
  dismiss: ["!dismiss", "!skip", "!complete", "!completed"],
  level: ["!level"],
  list: ["!list", "!queue"],
  modnext: ["!modnext"],
  modrandom: ["!modrandom"],
  next: ["!next"],
  open: ["!open"],
  order: ["!order"],
  pause: ["!pause"],
  persistence: ["!persistence"],
  position: ["!position", "!pos"],
  punt: ["!punt"],
  random: ["!random"],
  remove: ["!remove", "!leave"],
  replace: ["!replace", "!change", "!swap"],
  restart: ["!restart"],
  resume: ["!resume"],
  select: ["!select"],
  start: ["!start"],
  submitted: ["!submitted", "!entry", "!mylevel", "!mylvl"],
  subnext: ["!subnext"],
  subrandom: ["!subrandom"],
  weightedchance: ["!weightedchance", "!odds", "!chance", "!chances"],
  weightednext: ["!weightednext"],
  weightedrandom: ["!weightedrandom"],
  weightedsubnext: ["!weightedsubnext"],
  weightedsubrandom: ["!weightedsubrandom"],
};

let aliases: typeof defaultAliases;

const Aliases = {
  saveAliases: () => {
    if (!fs.existsSync(ALIASES_FILE.directory)) {
      fs.mkdirSync(ALIASES_FILE.directory);
    }
    writeFileAtomicSync(
      ALIASES_FILE.fileName,
      JSON.stringify(aliases, null, settings.prettySaveFiles ? 2 : 0),
      "utf-8"
    );
  },
  loadAliases: (create = false) => {
    if (create) {
      const defaults = JSON.stringify(
        defaultAliases,
        null,
        settings.prettySaveFiles ? 2 : 0
      );
      if (!fs.existsSync(ALIASES_FILE.directory)) {
        fs.mkdirSync(ALIASES_FILE.directory, { recursive: true });
      }
      writeFileAtomicSync(ALIASES_FILE.fileName, defaults, "utf-8");
      aliases = defaultAliases;
    }
    if (!create && !fs.existsSync(ALIASES_FILE.fileName)) {
      Aliases.loadAliases(true);
    }
    try {
      const data = AliasesScheme.parse(
        JSON.parse(fs.readFileSync(ALIASES_FILE.fileName, { encoding: "utf8" }))
      );
      // override defaults
      aliases = { ...defaultAliases, ...data };
    } catch (err) {
      console.warn(
        "An error occurred when trying to load %s. %s",
        ALIASES_FILE.fileName,
        err instanceof Error ? err.message : err
      );
      throw err;
    }
  },
  addAlias: (cmd: string, alias: string) => {
    if (!Aliases.isCommand(cmd) || Aliases.isDisabled(cmd)) {
      return false;
    }
    if (
      Object.values(aliases).filter((x) =>
        x.includes(alias.startsWith("!") ? alias : "!" + alias)
      ).length > 0
    ) {
      return false;
    }
    if (!alias.startsWith("!")) {
      aliases[cmd].push("!" + alias);
    } else {
      aliases[cmd].push(alias);
    }
    Aliases.saveAliases();
    return true;
  },
  removeAlias: (cmd: string, alias: string) => {
    if (!Aliases.isCommand(cmd) || Aliases.isDisabled(cmd)) {
      return false;
    }
    if (Object.values(aliases).filter((x) => x.includes(alias)).length <= 0) {
      return false;
    }
    if (!aliases[cmd].includes(alias)) {
      return false;
    }
    const indexOfAlias = aliases[cmd].indexOf(alias);
    aliases[cmd].splice(indexOfAlias, 1);
    Aliases.saveAliases();
    return true;
  },
  isDisabled: (cmd: string) => {
    return aliases[cmd].includes("disabled");
  },
  disableCommand: (cmd: string) => {
    if (!Aliases.isCommand(cmd) || Aliases.isDisabled(cmd)) {
      return false;
    }
    aliases[cmd].push("disabled");
    Aliases.saveAliases();
    return true;
  },
  enableCommand: (cmd: string) => {
    if (!Aliases.isCommand(cmd) || Aliases.isDisabled(cmd)) {
      aliases[cmd].pop();
      Aliases.saveAliases();
      return true;
    }
    return false;
  },
  isAlias: (cmd: string, message: string) => {
    if (Aliases.isDisabled(cmd)) {
      return false;
    }
    return aliases[cmd].includes(message.split(" ")[0]);
  },
  resetCommand: (cmd: string) => {
    if (Aliases.isCommand(cmd)) {
      aliases[cmd] = [];
      defaultAliases[cmd].forEach((x) => Aliases.addAlias(cmd, x));
      Aliases.saveAliases();
      return true;
    }
    return false;
  },
  getCommands: () => {
    return Object.keys(aliases);
  },
  isCommand: (cmd: string) => {
    return Object.keys(aliases).includes(cmd);
  },
  addDefault: (cmd: string, cmdAliases: string[]) => {
    defaultAliases[cmd] = cmdAliases;
    aliases = { ...defaultAliases, ...aliases };
  },
};

function getAliases() {
  return Aliases;
}

export { getAliases as aliases };
