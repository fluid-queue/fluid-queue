import { InitOptions } from "i18next";
import { FsBackendOptions } from "i18next-fs-backend";

import settings from "./settings.js";

export const options: InitOptions<FsBackendOptions> = {
  debug: settings.i18next_debug,
  initImmediate: false,
  lng: settings.language,
  fallbackLng: "en",
  ns: "fluid-queue",
  defaultNS: "fluid-queue",
  saveMissing: true,
  postProcess: ["pseudo"],
  interpolation: {
    skipOnVariables: false, // needed for ellipsis
    escapeValue: false,
  },
};
