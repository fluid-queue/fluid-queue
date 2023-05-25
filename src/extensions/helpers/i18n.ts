import i18next from "i18next";
import FsBackend, { FsBackendOptions } from "i18next-fs-backend";
import { join, dirname as pathDirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, lstatSync } from "fs";
import { log } from "../../chalk-print.js";

export async function init(extension: string) {
  if (process && process.env && process.env.NODE_ENV != "test") {
    const { options } = await import("../../i18next-options.js");

    // Tests are hecking weird, and don't need this, and break because of this
    // This feels like a hack but it works
    const dirname = pathDirname(fileURLToPath(import.meta.url));

    log(`Initializing i18next for extension ${extension}...`);
    await i18next.use(FsBackend).init<FsBackendOptions>({
      ...options,
      backend: {
        ...options.backend,
        loadPath: join(dirname, "../../locales/{{lng}}/{{ns}}.json"),
        addPath: join(dirname, "../../locales/{{lng}}/{{ns}}.missing.json"),
      },
      preload: readdirSync(join(dirname, "../../locales")).filter(
        (fileName) => {
          const joinedPath = join(join(dirname, "../../locales"), fileName);
          const isDirectory = lstatSync(joinedPath).isDirectory();
          return isDirectory;
        }
      ),
    });
  }
  await i18next.loadNamespaces(extension);
}
