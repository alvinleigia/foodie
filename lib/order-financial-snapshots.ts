import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export type OrderFinancialSnapshot = {
  chargeAmountSnapshot: string;
  discountAmountSnapshot: string;
  finalTotalAmountSnapshot: string;
  financialSnapshotCurrency: string;
  subtotalAmountSnapshot: string;
  taxAmountSnapshot: string;
  tipAmountSnapshot: string;
};

type StoredOrderFinancialSnapshot = {
  chargeAmountSnapshot: string | null;
  discountAmountSnapshot: string | null;
  finalTotalAmountSnapshot: string | null;
  financialSnapshotAt: Date | null;
  financialSnapshotCurrency: string | null;
  subtotalAmountSnapshot: string | null;
  taxAmountSnapshot: string | null;
  tipAmountSnapshot: string | null;
};

export function buildOrderFinancialSnapshot(input: {
  chargeAmountMinor?: number;
  currency: string;
  discountAmountMinor?: number;
  subtotalAmountMinor: number;
  taxAmountMinor: number;
  tipAmountMinor?: number;
}): OrderFinancialSnapshot {
  const currency = input.currency.trim().toUpperCase();
  const chargeAmountMinor = input.chargeAmountMinor ?? 0;
  const discountAmountMinor = input.discountAmountMinor ?? 0;
  const tipAmountMinor = input.tipAmountMinor ?? 0;
  const amounts = [
    input.subtotalAmountMinor,
    discountAmountMinor,
    input.taxAmountMinor,
    chargeAmountMinor,
    tipAmountMinor,
  ];

  if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
    throw new Error("Order financial amounts must be non-negative minor-unit integers.");
  }

  if (discountAmountMinor > input.subtotalAmountMinor) {
    throw new Error("Order discounts cannot exceed the subtotal.");
  }

  const finalTotalAmountMinor =
    input.subtotalAmountMinor -
    discountAmountMinor +
    input.taxAmountMinor +
    chargeAmountMinor +
    tipAmountMinor;

  return {
    chargeAmountSnapshot: minorUnitsToDecimal(chargeAmountMinor, currency),
    discountAmountSnapshot: minorUnitsToDecimal(discountAmountMinor, currency),
    finalTotalAmountSnapshot: minorUnitsToDecimal(
      finalTotalAmountMinor,
      currency,
    ),
    financialSnapshotCurrency: currency,
    subtotalAmountSnapshot: minorUnitsToDecimal(
      input.subtotalAmountMinor,
      currency,
    ),
    taxAmountSnapshot: minorUnitsToDecimal(input.taxAmountMinor, currency),
    tipAmountSnapshot: minorUnitsToDecimal(tipAmountMinor, currency),
  };
}

export function assertOrderFinancialSnapshotMatches(input: {
  current: OrderFinancialSnapshot;
  expected: OrderFinancialSnapshot;
}) {
  const currency = input.current.financialSnapshotCurrency;
  const monetaryFields = [
    "subtotalAmountSnapshot",
    "discountAmountSnapshot",
    "taxAmountSnapshot",
    "chargeAmountSnapshot",
    "tipAmountSnapshot",
    "finalTotalAmountSnapshot",
  ] as const;

  if (currency !== input.expected.financialSnapshotCurrency) {
    throw new Error("The finalized bill currency no longer matches the order.");
  }

  for (const field of monetaryFields) {
    if (
      decimalToMinorUnits(input.current[field], currency) !==
      decimalToMinorUnits(input.expected[field], currency)
    ) {
      throw new Error("The finalized bill totals no longer match the order.");
    }
  }
}

export function getFinalizedOrderFinancialSnapshot(
  input: StoredOrderFinancialSnapshot,
): OrderFinancialSnapshot | null {
  if (!input.financialSnapshotAt) {
    return null;
  }

  if (
    input.chargeAmountSnapshot === null ||
    input.discountAmountSnapshot === null ||
    input.finalTotalAmountSnapshot === null ||
    input.financialSnapshotCurrency === null ||
    input.subtotalAmountSnapshot === null ||
    input.taxAmountSnapshot === null ||
    input.tipAmountSnapshot === null
  ) {
    throw new Error("The finalized bill is missing financial snapshot values.");
  }

  return {
    chargeAmountSnapshot: input.chargeAmountSnapshot,
    discountAmountSnapshot: input.discountAmountSnapshot,
    finalTotalAmountSnapshot: input.finalTotalAmountSnapshot,
    financialSnapshotCurrency: input.financialSnapshotCurrency,
    subtotalAmountSnapshot: input.subtotalAmountSnapshot,
    taxAmountSnapshot: input.taxAmountSnapshot,
    tipAmountSnapshot: input.tipAmountSnapshot,
  };
}

export const emptyOrderFinancialSnapshot = {
  chargeAmountSnapshot: null,
  discountAmountSnapshot: null,
  finalTotalAmountSnapshot: null,
  financialSnapshotAt: null,
  financialSnapshotCurrency: null,
  subtotalAmountSnapshot: null,
  taxAmountSnapshot: null,
  tipAmountSnapshot: null,
} as const;
