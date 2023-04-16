import fs from "fs";
import { z } from "zod";
import { Settings } from "./settings-type.js";

export type Settings = z.infer<typeof Settings>;
/**
 * @deprecated Use the `Settings` type instead.
 */
export type settings = z.infer<typeof Settings>;

// To try to
export let fileName: string;
let settingsJson;
try {
  fileName = "settings/settings.json";
  settingsJson = fs.readFileSync(fileName, {
    encoding: "utf8",
  });
} catch (err) {
  if (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    err.code === "ENOENT"
  ) {
    fileName = "settings.json";
    settingsJson = fs.readFileSync(fileName, { encoding: "utf8" });
    console.warn(
      "Loading settings.json from the root directory is deprecated and may stop working in a future release."
    );
    console.warn("Please move settings.json into the settings directory.");
  } else {
    // We only care about the file not being found, other errors should be thrown
    throw err;
  }
}

export const settings: Settings = Settings.parse(JSON.parse(settingsJson));

export default settings;
