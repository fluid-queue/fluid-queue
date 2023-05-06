import i18next from "i18next";
import FsBackend, { FsBackendOptions } from "i18next-fs-backend";
import { join, dirname as pathDirname } from "path";
import { readdirSync, lstatSync } from "fs";
import { fileURLToPath } from "url";

import settings from "./settings.js";

const dirname = pathDirname(fileURLToPath(import.meta.url));

const backendOptions: FsBackendOptions = {
  loadPath: join(dirname, "../locales/{{lng}}/{{ns}}.json"),
  addPath: join(dirname, "../locales/{{lng}}/{{ns}}.missing.json"),
};

console.log("Initializing i18next...");
await i18next.use(FsBackend).init<FsBackendOptions>({
  debug: true,
  initImmediate: false,
  lng: settings.language,
  ns: "fluid-queue",
  defaultNS: "fluid-queue",
  preload: readdirSync(join(dirname, "../locales")).filter((fileName) => {
    const joinedPath = join(join(dirname, "../locales"), fileName);
    const isDirectory = lstatSync(joinedPath).isDirectory();
    return isDirectory;
  }),
  backend: backendOptions,
  saveMissing: true,
});
