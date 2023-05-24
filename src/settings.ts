import fs from "fs";
import { z } from "zod";
import { Settings } from "./settings-type.js";
import YAML from "yaml";

export type Settings = z.infer<typeof Settings>;
/**
 * @deprecated Use the `Settings` type instead.
 */
export type settings = z.infer<typeof Settings>;

export let fileName: string;
export let fileContents: string | undefined;

const fileNames = [
  "settings/settings.yml",
  "settings/settings.yaml",
  "settings/settings.json",
  "settings.json",
];

for (const value of fileNames) {
  fileName = value;
  try {
    fileContents = fs.readFileSync(fileName, {
      encoding: "utf8",
    });
    if (value.endsWith(".json")) {
      console.warn(
        `Loading ${fileName} is deprecated and may stop working in a future release.`
      );
      console.warn(`Please move '${fileName}' to '${fileNames[0]}'.`);
    }
    break;
  } catch (err) {
    if (
      typeof err === "object" &&
      err != null &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      // file not found
      continue;
    } else {
      // We only care about the file not being found, other errors should be thrown
      throw err;
    }
  }
}

if (fileContents == null) {
  throw new Error(`Settings file '${fileNames[0]}' not found.`);
}

// note: a valid JSON file can be parsed by YAML as well
export const settings: Settings = Settings.parse(YAML.parse(fileContents));

export default settings;
