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

export function allocateRefundAcrossPayments(input: {
  currency: string;
  payments: Array<{
    amount: string;
    id: string;
    method: "CASH" | "STRIPE_CHECKOUT";
  }>;
  refundAmount: string;
}) {
  let remainingMinor = decimalToMinorUnits(
    input.refundAmount,
    input.currency,
  );
  const allocations: Array<{
    amount: string;
    amountMinor: number;
    method: "CASH" | "STRIPE_CHECKOUT";
    orderPaymentId: string;
  }> = [];

  for (const payment of input.payments) {
    if (remainingMinor === 0) {
      break;
    }

    const paymentMinor = decimalToMinorUnits(payment.amount, input.currency);
    const amountMinor = Math.min(paymentMinor, remainingMinor);

    if (amountMinor <= 0) {
      continue;
    }

    allocations.push({
      amount: minorUnitsToDecimal(amountMinor, input.currency),
      amountMinor,
      method: payment.method,
      orderPaymentId: payment.id,
    });
    remainingMinor -= amountMinor;
  }

  if (remainingMinor > 0) {
    throw new Error("Successful payments do not cover the refund amount.");
  }

  return allocations;
}
