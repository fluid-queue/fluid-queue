import ExtensionsApi from "../extensions.js";
import settings from "../settings.js";
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
  `^(${code})${delim}(${code})${delim}(${code})$`
);
const levelCodeRegex = new RegExp(
  `(${code})${delim}(${code})${delim}(${code})`
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

const extractValidCode = (levelCode: string, lenient = false) => {
  // TODO: iterate through matches and check if the code is valid for each match and return the first valid one to make this even more lenient
  let match;
  if (lenient) {
    match = levelCode.match(levelCodeRegex);
  } else {
    match = levelCode.match(levelCodeRegexStrict);
  }
  if (match) {
    const courseIdString = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
    const validity = courseIdValidity(courseIdString);
    return {
      ...validity,
      code: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
      validSyntax: true,
    };
  }
  return {
    code: levelCode,
    valid: false,
    validSyntax: false,
    makerCode: false,
  };
};

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
  } else if (extractValidCode(code).makerCode) {
    return i18next.t("makerCode", { ns: "ocw", codeDisplay });
  } else {
    return i18next.t("levelCode", { ns: "ocw", codeDisplay });
  }
}

function resolver(args: string) {
  const result = extractValidCode(args, false);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

function lenientResolver(args: string) {
  const result = extractValidCode(args, true);
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

export async function setup(api: ExtensionsApi) {
  api
    .queueEntry("ocw", "ocw level code")
    .usingCode()
    .build(display)
    .registerResolver("ocw", resolver)
    .registerResolver("ocw-lenient", lenientResolver)
    .registerUpgrade(upgrade);
}
