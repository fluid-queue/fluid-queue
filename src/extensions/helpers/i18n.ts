import i18next from "i18next";
import FsBackend, { FsBackendOptions } from "i18next-fs-backend";
import { join, dirname as pathDirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, lstatSync } from "fs";
import { log } from "../../chalk-print.js";

/**
 * @param extension The name of the extension.
 * @param url The url of the extension used to locate the locales folder.
 */
export async function init(extension: string, url?: string) {
  if (!i18next.use(FsBackend).isInitialized) {
    // Only initialize i18next if it has not been initialized yet.
    // This is the case for extensions loaded by the esbuild code.
    const { options } = await import("../../i18next-options.js");
    const localesPath = join(
      pathDirname(fileURLToPath(url ?? import.meta.url)),
      "../../locales"
    );

    log(`Initializing i18next for extension ${extension}...`);
    await i18next.use(FsBackend).init<FsBackendOptions>({
      ...options,
      backend: {
        ...options.backend,
        loadPath: join(localesPath, "{{lng}}/{{ns}}.json"),
        addPath: join(localesPath, "{{lng}}/{{ns}}.missing.json"),
      },
      preload: readdirSync(localesPath).filter((fileName) => {
        const joinedPath = join(localesPath, fileName);
        const isDirectory = lstatSync(joinedPath).isDirectory();
        return isDirectory;
      }),
    });
  }
  await i18next.loadNamespaces(extension);
}
