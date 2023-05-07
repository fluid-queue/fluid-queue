import i18next from "i18next";
import FsBackend, { FsBackendOptions } from "i18next-fs-backend";

import { options } from "../../i18n.js";

console.log("Initializing i18next for extensions...");
await i18next.use(FsBackend).init<FsBackendOptions>(options);
