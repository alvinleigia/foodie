import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export function calculatePaymentBalance(input: {
  amount: string;
  collectedAmount: string;
  currency: string;
}) {
  const amountMinor = decimalToMinorUnits(input.amount, input.currency);
  const collectedMinor = decimalToMinorUnits(
    input.collectedAmount,
    input.currency,
  );

  if (amountMinor <= 0) {
    throw new Error("This order does not have a collectible total.");
  }

  if (collectedMinor > amountMinor) {
    throw new Error("Collected payments exceed the bill total.");
  }

  const remainingMinor = amountMinor - collectedMinor;

  return {
    amountMinor,
    collectedAmount: minorUnitsToDecimal(collectedMinor, input.currency),
    collectedMinor,
    remainingAmount: minorUnitsToDecimal(remainingMinor, input.currency),
    remainingMinor,
  };
}

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
    throw new Error("Cash received must cover the amount being collected.");
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
