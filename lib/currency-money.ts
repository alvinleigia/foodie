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

export function getCurrencyMinorUnitFactor(currency: string) {
  return zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
}

export function decimalToMinorUnits(value: string, currency: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Order contains an invalid price.");
  }

  return Math.round(amount * getCurrencyMinorUnitFactor(currency));
}

export function minorUnitsToDecimal(value: number, currency: string) {
  const factor = getCurrencyMinorUnitFactor(currency);

  return (value / factor).toFixed(factor === 1 ? 0 : 2);
}
