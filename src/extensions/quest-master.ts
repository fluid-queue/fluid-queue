import ExtensionsApi from "../extensions.js";
import { z } from "zod";

const levelCodeRegex = new RegExp("^([0-9]*)$");

const Options = z
  .object({
    minLength: z.number().int().positive().default(7),
    maxLength: z.number().int().positive().default(20),
  })
  .default({ minLength: 7, maxLength: 20 });

const extractValidCode = (
  levelCode: string,
  minLength: number,
  maxLength: number
) => {
  const match = levelCode.trim().match(levelCodeRegex);
  if (match) {
    const code = `${match[1]}`;
    const validity = code.length >= minLength && code.length <= maxLength; // is there a way to check validity?
    return {
      valid: validity,
      code,
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

function resolver(
  code: string,
  { minLength, maxLength }: { minLength: number; maxLength: number }
): { code: string } | null {
  const result = extractValidCode(code.trim(), minLength, maxLength);
  if (result.valid) {
    return { code: result.code };
  }
  return null;
}

export function setup(api: ExtensionsApi) {
  const options = api.options("quest-master", Options);
  api
    .queueEntry("quest-master", "Quest Master Dungeon ID")
    .usingCode()
    .build(display)
    .registerResolver("quest-master", (code) => resolver(code, options));
}
