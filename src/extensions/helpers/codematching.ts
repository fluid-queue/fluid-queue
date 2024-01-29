type ValidCodeResult = {
  valid: boolean;
  code: string;
  makerCode: boolean;
};

/**
 * this function extracts a level code found in someones message
 * and returns that level code (if possible) and also checks it's validity
 *
 * @param levelCode The use input where the level code is parsed from
 * @param regexp The regular expression to be used to find the level code in the user input
 * @param validityFn The function to check if a level code is valid
 * @returns a valid result if there was a valid match
 */
export function extractValidCode(
  levelCode: string,
  regexp: RegExp,
  validityFn: (code: string) => Omit<ValidCodeResult, "code">
): ValidCodeResult {
  const matches = [...levelCode.matchAll(regexp)];
  for (const match of matches) {
    const courseIdString = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
    const validity = validityFn(courseIdString);
    if (matches.length > 1 && !validity.valid) {
      // try a different code if this one is not valid
      // unless if matches has exactly one match (so the invalid code can be returned)
      continue;
    }
    return {
      ...validity,
      code: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
    };
  }
  return {
    code: levelCode,
    valid: false,
    makerCode: false,
  };
}
