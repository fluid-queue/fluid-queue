import ExtensionsApi from "../extensions.js";
import settings from "../settings.js";
import {
  courseIdValidity as _courseIdValidity,
  CodeTypes,
} from "./helpers/codeparsing.js";

import i18next from "i18next";
if (process && process.env && process.env.NODE_ENV != "test") {
  await import("./helpers/i18n.js");
}
await i18next.loadNamespaces("smm2");

const delim = "[-. ]?";
const code = "[A-Ha-hJ-Nj-nP-Yp-y0-9]{3}";
const codeStrict = "[A-Ha-hJ-Nj-nP-Yp-y0-9]{2}[fghFGH]";
const levelCodeRegexStrict = new RegExp(
  `^(${code})${delim}(${code})${delim}(${codeStrict})$`
);
const levelCodeRegex = new RegExp(
  `(${code})${delim}(${code})${delim}(${codeStrict})`
);

// This function returns true if the course id given to it is a valid course id. The optional parameter dataIdThresHold
// will make the function return false if the data id of the submitted level is greater than it.
// For max data id threshold, if you only want to have a max maker id threshold, send the 2nd argument as null.
/**
 * @param {string} courseIdString
 * @param {number | undefined} dataIdCourseThreshold
 * @param {number | undefined} dataIdMakerThreshold
 */
function courseIdValidity(
  courseIdString: string,
  dataIdCourseThreshold?: number | null,
  dataIdMakerThreshold?: number | null
) {
  const parsed = _courseIdValidity(courseIdString);

  // If it's just invalid, return that
  if (!parsed.valid || parsed.type !== CodeTypes.NSO) {
    return { valid: false, makerCode: false };
  }

  // Check the thresholds, if applicable
  if (dataIdMakerThreshold != null && parsed.makerCode) {
    return { valid: parsed.dataId <= dataIdMakerThreshold, makerCode: true };
  } else if (dataIdCourseThreshold != null && !parsed.makerCode) {
    return { valid: parsed.dataId <= dataIdCourseThreshold, makerCode: false };
  }

  // Return the parsed results
  return { valid: parsed.valid, makerCode: parsed.makerCode };
}

// this function extracts a level code found in someones message
// and returns that level code (if possible) and also checks it's validity
// the returned object will contain
// - a `code` field which either contains the found level/maker code or the original message
// - a `valid` field which will be true iff a level/maker code has the correct syntax and is one that can be generated by the game
// - and a `validSyntax` field which will be true iff a level/maker code has the correct syntax
const extractValidCode = (levelCode: string, strict = true) => {
  // TODO: iterate through matches and check if the code is valid for each match and return the first valid one to make this even more lenient
  const match = levelCode.match(strict ? levelCodeRegexStrict : levelCodeRegex);
  if (match) {
    const courseIdString = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
    const validity = courseIdValidity(
      courseIdString,
      settings.dataIdCourseThreshold,
      settings.dataIdMakerThreshold
    );
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
  if (
    settings.showMakerCode === false ||
    extractValidCode(code).makerCode === false
  ) {
    return i18next.t("levelCodeNoSuffix", { ns: "smm2", code });
  } else {
    return i18next.t("makerCode", { ns: "smm2", code });
  }
}

function strictResolve(args: string) {
  const result = extractValidCode(args, true);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

function resolve(args: string) {
  const result = extractValidCode(args, false);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

function upgrade(code: string): { code: string } | null {
  const result = courseIdValidity(
    code,
    settings.dataIdCourseThreshold,
    settings.dataIdMakerThreshold
  );
  if (result.valid) {
    return { code: code };
  }
  return null;
}

export async function setup(api: ExtensionsApi) {
  api
    .queueEntry("smm2", "smm2 level code")
    .usingCode()
    .build(display)
    .registerResolver("smm2", strictResolve)
    .registerResolver("smm2-lenient", resolve)
    .registerUpgrade(upgrade);
}
