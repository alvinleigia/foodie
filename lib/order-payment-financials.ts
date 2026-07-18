import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export function calculateCashSettlement(input: {
  amount: string;
  currency: string;
  tenderedAmount: string;
}) {
  const amountMinor = decimalToMinorUnits(input.amount, input.currency);
  const tenderedMinor = decimalToMinorUnits(
    input.tenderedAmount,
    input.currency,
  );

  if (amountMinor <= 0) {
    throw new Error("This order does not have a collectible total.");
  }

  if (tenderedMinor < amountMinor) {
    throw new Error("Cash tendered must cover the full bill.");
  }

  return {
    amountMinor,
    changeAmount: minorUnitsToDecimal(
      tenderedMinor - amountMinor,
      input.currency,
    ),
    changeMinor: tenderedMinor - amountMinor,
    tenderedAmount: minorUnitsToDecimal(tenderedMinor, input.currency),
    tenderedMinor,
  };
}
