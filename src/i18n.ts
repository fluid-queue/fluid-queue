import i18next from "i18next";
import FsBackend, { FsBackendOptions } from "i18next-fs-backend";
import { join, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, lstatSync } from "node:fs";
import { options } from "./i18next-options.js";
import Pseudo from "i18next-pseudo";
import { log } from "./chalk-print.js";

const dirname = pathDirname(fileURLToPath(import.meta.url));

log("Initializing i18next...");
await i18next
  .use(FsBackend)
  .use(
    new Pseudo({
      enabled: options.debug,
      languageToPseudo: "en",
    })
  )
  .init<FsBackendOptions>({
    ...options,
    backend: {
      ...options.backend,
      loadPath: join(dirname, "../locales/{{lng}}/{{ns}}.json"),
      addPath: join(dirname, "../locales/{{lng}}/{{ns}}.missing.json"),
    },
    preload: readdirSync(join(dirname, "../locales")).filter((fileName) => {
      const joinedPath = join(join(dirname, "../locales"), fileName);
      const isDirectory = lstatSync(joinedPath).isDirectory();
      return isDirectory;
    }),
  });
