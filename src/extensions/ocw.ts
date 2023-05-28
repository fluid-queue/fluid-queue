import ExtensionsApi from "../extensions.js";
import settings from "../settings.js";
import { extractValidCode } from "./helpers/codematching.js";
import {
  courseIdValidity as _courseIdValidity,
  CodeTypes,
} from "./helpers/codeparsing.js";
import i18next from "i18next";

await (await import("./helpers/i18n.js")).init("ocw");

// Need a slightly different regex because we don't know what OCW IDs will end with
// If anyone figures that out, we can update this, but it would still be different
const delim = "[-. ]?";
const code = "[A-Ha-hJ-Nj-nP-Yp-y0-9]{3}";
const levelCodeRegexStrict = new RegExp(
  `^(${code})${delim}(${code})${delim}(${code})$`,
  "g"
);
const levelCodeRegex = new RegExp(
  `(?=(${code})${delim}(${code})${delim}(${code}))`,
  "g"
);

function courseIdValidity(courseIdString: string) {
  // Parse the code details out
  const parsed = _courseIdValidity(courseIdString);

  // Make sure it's an OCW code
  if (parsed.type !== CodeTypes.OCW) {
    return { valid: false, makerCode: false };
  }

  // And then return the parsed results
  return { valid: parsed.valid, makerCode: parsed.makerCode };
}

function display(code: string) {
  let codeDisplay = code;
  if (
    settings.extensionOptions &&
    settings.extensionOptions.ocw &&
    (settings.extensionOptions.ocw.removeDashes == "true" ||
      settings.extensionOptions.ocw.removeDashes == "yes")
  ) {
    codeDisplay = code.replaceAll("-", "");
  }
  if (settings.showMakerCode === false) {
    return i18next.t("levelCodeNoSuffix", { ns: "ocw", codeDisplay });
  } else if (
    extractValidCode(code, levelCodeRegexStrict, courseIdValidity).makerCode
  ) {
    return i18next.t("makerCode", { ns: "ocw", codeDisplay });
  } else {
    return i18next.t("levelCode", { ns: "ocw", codeDisplay });
  }
}

function resolver(args: string) {
  const result = extractValidCode(args, levelCodeRegexStrict, courseIdValidity);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

function lenientResolver(args: string) {
  const result = extractValidCode(args, levelCodeRegex, courseIdValidity);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

function upgrade(code: string): { code: string } | null {
  const result = courseIdValidity(code);
  if (result.valid) {
    return { code: code };
  }
  return null;
}

export function setup(api: ExtensionsApi) {
  api
    .queueEntry("ocw", "ocw level code")
    .usingCode()
    .build(display)
    .registerResolver("ocw", resolver)
    .registerResolver("ocw-lenient", lenientResolver)
    .registerUpgrade(upgrade);
}
