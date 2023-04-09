import ExtensionsApi from "../extensions";
import * as settings from "../settings";
import {
  courseIdValidity as _courseIdValidity,
  CodeTypes,
} from "./helpers/codeparsing";

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

const codeSuffix = (levelCode: string) => {
  if (settings.showMakerCode !== false) {
    const makerCode = extractValidCode(levelCode).makerCode;
    if (makerCode) {
      return " (OCW maker code)";
    }
    return " (OCW level code)";
  }
  return " (OCW)";
};

const levelType = {
  display(level: { code: string }) {
    return level.code + codeSuffix(level.code);
  },
};

const resolver = {
  description: "ocw level code",
  resolve(args: string) {
    const result = extractValidCode(args, false);
    if (result.valid) {
      return { type: "ocw", code: result.code };
    }
    return null;
  },
};

const lenientResolver = {
  description: "ocw level code",
  resolve(args: string) {
    const result = extractValidCode(args, true);
    if (result.valid) {
      return { type: "ocw", code: result.code };
    }
    return null;
  },
};

const queueHandler = {
  upgrade(code: string) {
    const result = courseIdValidity(code);
    if (result.valid) {
      return { type: "ocw", code: code };
    }
    return null;
  },
};

export const setup = (api: ExtensionsApi) => {
  api.registerEntryType("ocw", levelType);
  api.registerResolver("ocw", resolver);
  api.registerResolver("ocw-lenient", lenientResolver);
  api.registerQueueHandler(queueHandler);
};
