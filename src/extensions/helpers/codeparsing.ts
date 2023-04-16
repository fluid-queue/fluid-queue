const standardBase30 = "0123456789abcdefghijklmnopqrst";
const nintendoBase30 = "0123456789BCDFGHJKLMNPQRSTVWXY";
const arbitraryXorValue = 377544828;

// Magic numbers borrowed from the OCW Project
const VALUE_SIZE_B = BigInt(26);
const META_SIZE_B = BigInt(8);
const VALUE_SIZE_C = BigInt(6);
const INT4_MASK = BigInt(0b1111);
const INT8_MASK = BigInt(0b11111111);
const OCW_LEVEL_META = BigInt(808);
const OCW_MAKER_META = BigInt(1337);

// Magic numbers slightly reverse engineered from actual NSO codes
const NSO_LEVEL_META = BigInt(2117);
const NSO_MAKER_META = BigInt(2245);

const CodeTypes = {
  Invalid: "INVALID",
  NSO: "NSO",
  OCW: "OCW",
};

// https://stackoverflow.com/a/55646905
function parseBigInt(value: string, radix: number) {
  const size = 10;
  const factor = BigInt(radix ** size);
  let i = value.length % size || size;
  const parts = [value.slice(0, i)];

  while (i < value.length) {
    parts.push(value.slice(i, (i += size)));
  }

  return parts.reduce((r, v) => r * factor + BigInt(parseInt(v, radix)), 0n);
}

// Get the unchanging meta bits and turn them into a number
function getMeta(courseBits: bigint) {
  const a =
    (courseBits >> (VALUE_SIZE_B + META_SIZE_B + VALUE_SIZE_C)) & INT4_MASK;
  const b = (courseBits >> BigInt(VALUE_SIZE_C)) & BigInt(INT8_MASK);
  return (a << BigInt(META_SIZE_B)) | b;
}

function _courseIdValidity(courseIdString: string) {
  const _reversedString = courseIdString.split("").reverse();
  const reversedString = _reversedString
    .map((c) => standardBase30[nintendoBase30.indexOf(c)])
    .join("");
  const courseBits = parseBigInt(reversedString, 30);

  // Extract the course meta bits to determine valid/invalid and maker/course ID
  const courseMeta = getMeta(courseBits);

  // Extract the data ID so it can be used for NSO codes
  const courseBitsString = courseBits.toString(2);

  // This is a useful check, but needs to be limited to NSO codes
  let dataId;
  if (courseMeta !== BigInt(808) && courseMeta !== BigInt(1337)) {
    if (courseBitsString.length !== 44) {
      return {
        type: CodeTypes.Invalid,
        valid: false,
        makerCode: false,
        dataId: 0,
      };
    }
    dataId =
      parseInt(
        courseBitsString
          .substring(32, 44)
          .concat(courseBitsString.substring(10, 30)),
        2
      ) ^ arbitraryXorValue;
  } else {
    // we can set the dataId to 0 for OCW codes, since it's only used for NSO codes
    dataId = 0;
  }

  // Use the meta bits to determine a level type
  if (courseMeta === OCW_LEVEL_META) {
    return {
      type: CodeTypes.OCW,
      valid: true,
      makerCode: false,
      dataId: dataId,
    };
  } else if (courseMeta === OCW_MAKER_META) {
    return {
      type: CodeTypes.OCW,
      valid: true,
      makerCode: true,
      dataId: dataId,
    };
  } else if (courseMeta === NSO_LEVEL_META) {
    return {
      type: CodeTypes.NSO,
      valid: true,
      makerCode: false,
      dataId: dataId,
    };
  } else if (courseMeta === NSO_MAKER_META) {
    return {
      type: CodeTypes.NSO,
      valid: true,
      makerCode: true,
      dataId: dataId,
    };
  }

  // If the code doesn't match the known metas, it's invalid
  return {
    type: CodeTypes.Invalid,
    valid: false,
    makerCode: false,
    dataId: dataId,
  };
}

export { _courseIdValidity as courseIdValidity, CodeTypes };
