import ExtensionsApi from "../extensions.js";
import { createHmac } from "crypto";

const delim = "[-. ]?";
const code = "[0-9a-fA-F]{4}";
const levelCodeRegex = new RegExp(
  `^(${code})${delim}0000${delim}(${code})${delim}(${code})$`
);
const firstId = 1008512; // inclusive
const lastId = 69559301; // inclusive
const key = Uint8Array.from(
  Buffer.from("9ce21c9e046e85f0cf6ca00d1eaaaf5f", "hex")
);

function courseIdValidity(checksum: string, courseIdString: string) {
  const levelId = new DataView(
    Uint8Array.from(Buffer.from(courseIdString, "hex")).buffer
  ).getInt32(0, false);
  if (levelId < firstId || levelId > lastId) {
    // level id outside of range of valid ids
    return false;
  }
  const data = Buffer.from("00000000" + courseIdString, "hex").reverse();
  let hmac = createHmac("md5", key).update(data).digest("hex");
  hmac = (hmac.substring(6, 8) + hmac.substring(4, 6)).toUpperCase();
  return checksum.toUpperCase() == hmac;
}

// this function extracts a level code found in someones message
// and returns that level code (if possible) and also checks it's validity
// the returned object will contain
// - a `code` field which either contains the found level code or the original message
// - a `valid` field which will be true iff a level code has the correct syntax and is one that can be generated by the game
// - and a `validSyntax` field which will be true iff a level code has the correct syntax
const extractValidCode = (levelCode: string) => {
  const match = levelCode.match(levelCodeRegex);
  if (match) {
    const checksum = `${match[1]}`;
    const courseIdString = `${match[2]}${match[3]}`;
    const validity = courseIdValidity(checksum, courseIdString);
    return {
      valid: validity,
      code: `${match[1]}-0000-${match[2]}-${match[3]}`.toUpperCase(),
      validSyntax: true,
    };
  }
  return {
    code: levelCode,
    valid: false,
    validSyntax: false,
  };
};

function display(code: string) {
  return code;
}

function resolver(code: string): { code: string } | null {
  const result = extractValidCode(code.trim());
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

export function setup(api: ExtensionsApi) {
  api
    .queueEntry("smm1", "smm1 level code")
    .usingCode()
    .build(display)
    .registerResolver("smm1", resolver);
}
