import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export function calculateCancellationAmounts(input: {
  amount: string;
  currency: string;
  feeBps: number;
}) {
  if (
    !Number.isInteger(input.feeBps) ||
    input.feeBps < 0 ||
    input.feeBps > 10_000
  ) {
    throw new Error("Cancellation fee must be between 0% and 100%.");
  }

  const grossMinor = decimalToMinorUnits(input.amount, input.currency);
  const feeMinor = Math.round((grossMinor * input.feeBps) / 10_000);
  const refundMinor = Math.max(grossMinor - feeMinor, 0);

  return {
    feeAmount: minorUnitsToDecimal(feeMinor, input.currency),
    feeMinor,
    grossAmount: minorUnitsToDecimal(grossMinor, input.currency),
    grossMinor,
    refundAmount: minorUnitsToDecimal(refundMinor, input.currency),
    refundMinor,
  };
}
