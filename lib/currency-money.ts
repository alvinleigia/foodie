const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const threeDecimalCurrencies = new Set([
  "BHD",
  "JOD",
  "KWD",
  "OMR",
  "TND",
]);

function assertSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
}

function roundRatioHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
) {
  if (denominator <= BigInt(0)) {
    throw new Error("Rounding denominator must be greater than zero.");
  }

  const isNegative = numerator < BigInt(0);
  const absoluteNumerator = isNegative ? -numerator : numerator;
  let quotient = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;

  if (remainder * BigInt(2) >= denominator) {
    quotient += BigInt(1);
  }

  return isNegative ? -quotient : quotient;
}

function toSafeNumber(value: bigint, label: string) {
  const result = Number(value);

  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} exceeds the supported monetary range.`);
  }

  return result;
}

export function getCurrencyMinorUnitDigits(currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (zeroDecimalCurrencies.has(normalizedCurrency)) {
    return 0;
  }

  if (threeDecimalCurrencies.has(normalizedCurrency)) {
    return 3;
  }

  return 2;
}

export function getCurrencyMinorUnitFactor(currency: string) {
  return 10 ** getCurrencyMinorUnitDigits(currency);
}

export function decimalToMinorUnits(value: string, currency: string) {
  const normalizedValue = value.trim();
  const match = /^(?:\d+(?:\.\d*)?|\.\d+)$/.exec(normalizedValue);

  if (!match) {
    throw new Error("Order contains an invalid price.");
  }

  const [wholePart = "0", fractionalPart = ""] = normalizedValue.split(".");
  const digits = getCurrencyMinorUnitDigits(currency);
  const factor = BigInt(10) ** BigInt(digits);
  const fractionScale = BigInt(10) ** BigInt(fractionalPart.length);
  const sourceScale =
    fractionScale > BigInt(0) ? fractionScale : BigInt(1);
  const sourceAmount =
    BigInt(wholePart || "0") * sourceScale +
    BigInt(fractionalPart || "0");
  const amountMinor = roundRatioHalfAwayFromZero(
    sourceAmount * factor,
    sourceScale,
  );

  return toSafeNumber(amountMinor, "Price");
}

export function minorUnitsToDecimal(value: number, currency: string) {
  assertSafeInteger(value, "Minor-unit amount");

  const digits = getCurrencyMinorUnitDigits(currency);
  const isNegative = value < 0;
  const absoluteValue = BigInt(Math.abs(value));

  if (digits === 0) {
    return `${isNegative ? "-" : ""}${absoluteValue}`;
  }

  const factor = BigInt(10) ** BigInt(digits);
  const wholePart = absoluteValue / factor;
  const fractionalPart = (absoluteValue % factor)
    .toString()
    .padStart(digits, "0");

  return `${isNegative ? "-" : ""}${wholePart}.${fractionalPart}`;
}

export function multiplyAndRoundMinorUnits(
  amountMinor: number,
  multiplier: number,
  divisor: number,
) {
  assertSafeInteger(amountMinor, "Minor-unit amount");
  assertSafeInteger(multiplier, "Rounding multiplier");
  assertSafeInteger(divisor, "Rounding divisor");

  if (divisor <= 0) {
    throw new Error("Rounding divisor must be greater than zero.");
  }

  return toSafeNumber(
    roundRatioHalfAwayFromZero(
      BigInt(amountMinor) * BigInt(multiplier),
      BigInt(divisor),
    ),
    "Rounded amount",
  );
}

export function calculateBasisPointsAmount(
  amountMinor: number,
  basisPoints: number,
) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("Basis points must be between 0 and 10000.");
  }

  return multiplyAndRoundMinorUnits(amountMinor, basisPoints, 10_000);
}
