const standardBase30 = "0123456789abcdefghijklmnopqrst";
const nintendoBase30 = "0123456789BCDFGHJKLMNPQRSTVWXY";
const arbitraryXorValue = 377544828;

const VALUE_SIZE_B = BigInt(26);
const META_SIZE_B = BigInt(8);
const VALUE_SIZE_C = BigInt(6);
const INT4_MASK = BigInt(0b1111);
const INT8_MASK = BigInt(0b11111111);

const CodeTypes = {
  Invalid: "INVALID",
  NSO: "NSO",
  OCW: "OCW",
};

// https://stackoverflow.com/a/55646905
function parseBigInt(value, radix) {
  var size = 10,
    factor = BigInt(radix ** size),
    i = value.length % size || size,
    parts = [value.slice(0, i)];

  while (i < value.length) parts.push(value.slice(i, (i += size)));

  return parts.reduce((r, v) => r * factor + BigInt(parseInt(v, radix)), 0n);
}

function getMeta(courseBits) {
  let a =
    (courseBits >> (VALUE_SIZE_B + META_SIZE_B + VALUE_SIZE_C)) & INT4_MASK;
  let b = (courseBits >> BigInt(VALUE_SIZE_C)) & BigInt(INT8_MASK);
  return (a << BigInt(META_SIZE_B)) | b;
}

function courseIdValidity(courseIdString) {
  let reversedString = courseIdString.split("").reverse();
  reversedString = reversedString
    .map((c) => standardBase30[nintendoBase30.indexOf(c)])
    .join("");
  let courseBits = parseBigInt(reversedString, 30);

  // Extract the course meta bits to determine valid/invalid and maker/course ID
  let courseMeta = getMeta(courseBits);

  // Extract the data ID so it can be used for NSO codes
  let courseBitsString = courseBits.toString(2);

  // This is a useful check, but needs to be limited to NSO codes
  let dataId;
  if (courseMeta !== BigInt(808) && courseMeta !== BigInt(1337)) {
    if (courseBitsString.length !== 44) {
      return {
        type: CodeTypes.Invalid,
        valid: false,
        makerCode: false,
        dataId: dataId,
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

  if (courseMeta === BigInt(808)) {
    return {
      type: CodeTypes.OCW,
      valid: true,
      makerCode: false,
      dataId: dataId,
    };
  } else if (courseMeta === BigInt(1337)) {
    return {
      type: CodeTypes.OCW,
      valid: true,
      makerCode: true,
      dataId: dataId,
    };
  } else if (courseMeta === BigInt(2117)) {
    return {
      type: CodeTypes.NSO,
      valid: true,
      makerCode: false,
      dataId: dataId,
    };
  } else if (courseMeta === BigInt(2245)) {
    return {
      type: CodeTypes.NSO,
      valid: true,
      makerCode: true,
      dataId: dataId,
    };
  }

  return {
    type: CodeTypes.Invalid,
    valid: false,
    makerCode: false,
    dataId: dataId,
  };
}

module.exports = {
  courseIdValidity: courseIdValidity,
  CodeTypes: CodeTypes,
};
