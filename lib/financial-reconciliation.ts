import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export type FinancialOrderLedgerRow = {
  cancellationFeeAmount: string | null;
  chargeAmountSnapshot: string | null;
  discountAmountSnapshot: string | null;
  finalTotalAmountSnapshot: string | null;
  financialSnapshotCurrency: string | null;
  id: string;
  paymentCollectedAmount: string;
  paymentCurrency: string | null;
  paymentStatus: string;
  refundAmount: string | null;
  status: string;
  subtotalAmountSnapshot: string | null;
  taxAmountSnapshot: string | null;
  tipAmountSnapshot: string | null;
};

export type FinancialAdjustmentLedgerRow = {
  amount: string;
  currency: string;
  entryKind: "APPLY" | "REVERSAL";
  orderId: string;
  type: "DISCOUNT" | "COMP" | "SERVICE_CHARGE" | "TIP";
};

export type FinancialPaymentLedgerRow = {
  amount: string;
  currency: string;
  orderId: string;
};

export type FinancialRefundLedgerRow = {
  amount: string;
  currency: string;
  orderId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
};

export type FinancialReconciliationRow = {
  adjustmentMismatchOrders: number;
  billedTotal: string;
  chargeTotal: string;
  collectedPaymentTotal: string;
  currency: string;
  currencyMismatchEntries: number;
  discountTotal: string;
  failedRefundCount: number;
  isReconciled: boolean;
  netCollectedTotal: string;
  netSalesTotal: string;
  orderCount: number;
  outstandingBalance: string;
  overpaymentAmount: string;
  paymentMismatchOrders: number;
  pendingRefundCount: number;
  pendingRefundTotal: string;
  refundedTotal: string;
  refundMismatchOrders: number;
  subtotalTotal: string;
  taxTotal: string;
  tipTotal: string;
};

type OrderReconciliation = {
  adjustmentChargeMinor: number;
  adjustmentDiscountMinor: number;
  adjustmentTipMinor: number;
  currency: string;
  expectedChargeMinor: number;
  expectedDiscountMinor: number;
  expectedNetSalesMinor: number;
  expectedRefundMinor: number;
  expectedTipMinor: number;
  paymentLedgerMinor: number;
  recordedCollectedMinor: number;
  refundLedgerMinor: number;
  summary: CurrencyReconciliation;
};

type CurrencyReconciliation = {
  adjustmentMismatchOrders: number;
  billedMinor: number;
  chargeMinor: number;
  collectedPaymentMinor: number;
  currency: string;
  currencyMismatchEntries: number;
  discountMinor: number;
  failedRefundCount: number;
  netCollectedMinor: number;
  netSalesMinor: number;
  orderCount: number;
  outstandingMinor: number;
  overpaymentMinor: number;
  paymentMismatchOrders: number;
  pendingRefundCount: number;
  pendingRefundMinor: number;
  refundedMinor: number;
  refundMismatchOrders: number;
  subtotalMinor: number;
  taxMinor: number;
  tipMinor: number;
};

function normalizeCurrency(currency: string | null) {
  const normalized = currency?.trim().toUpperCase();
  return normalized?.length === 3 ? normalized : null;
}

function amountMinor(value: string | null, currency: string) {
  return value === null ? 0 : decimalToMinorUnits(value, currency);
}

function createCurrencySummary(currency: string): CurrencyReconciliation {
  return {
    adjustmentMismatchOrders: 0,
    billedMinor: 0,
    chargeMinor: 0,
    collectedPaymentMinor: 0,
    currency,
    currencyMismatchEntries: 0,
    discountMinor: 0,
    failedRefundCount: 0,
    netCollectedMinor: 0,
    netSalesMinor: 0,
    orderCount: 0,
    outstandingMinor: 0,
    overpaymentMinor: 0,
    paymentMismatchOrders: 0,
    pendingRefundCount: 0,
    pendingRefundMinor: 0,
    refundedMinor: 0,
    refundMismatchOrders: 0,
    subtotalMinor: 0,
    taxMinor: 0,
    tipMinor: 0,
  };
}

function getSummary(
  summaries: Map<string, CurrencyReconciliation>,
  currency: string,
) {
  const existing = summaries.get(currency);

  if (existing) {
    return existing;
  }

  const summary = createCurrencySummary(currency);
  summaries.set(currency, summary);
  return summary;
}

function isFinalRefundStatus(paymentStatus: string) {
  return paymentStatus === "REFUNDED" || paymentStatus === "PARTIALLY_REFUNDED";
}

export function reconcileFinancialLedgers(input: {
  adjustments: FinancialAdjustmentLedgerRow[];
  orders: FinancialOrderLedgerRow[];
  payments: FinancialPaymentLedgerRow[];
  refunds: FinancialRefundLedgerRow[];
}) {
  const summaries = new Map<string, CurrencyReconciliation>();
  const orderReconciliations = new Map<string, OrderReconciliation>();
  let missingSnapshotOrders = 0;

  for (const order of input.orders) {
    const currency = normalizeCurrency(
      order.financialSnapshotCurrency ?? order.paymentCurrency,
    );

    if (!currency || order.finalTotalAmountSnapshot === null) {
      missingSnapshotOrders += 1;
      continue;
    }

    const summary = getSummary(summaries, currency);
    const billedMinor = amountMinor(order.finalTotalAmountSnapshot, currency);
    const chargeMinor = amountMinor(order.chargeAmountSnapshot, currency);
    const discountMinor = amountMinor(order.discountAmountSnapshot, currency);
    const tipMinor = amountMinor(order.tipAmountSnapshot, currency);
    const expectedNetSalesMinor =
      order.status === "CANCELLED"
        ? amountMinor(order.cancellationFeeAmount, currency)
        : billedMinor;

    summary.billedMinor += billedMinor;
    summary.chargeMinor += chargeMinor;
    summary.discountMinor += discountMinor;
    summary.netSalesMinor += expectedNetSalesMinor;
    summary.orderCount += 1;
    summary.subtotalMinor += amountMinor(order.subtotalAmountSnapshot, currency);
    summary.taxMinor += amountMinor(order.taxAmountSnapshot, currency);
    summary.tipMinor += tipMinor;

    orderReconciliations.set(order.id, {
      adjustmentChargeMinor: 0,
      adjustmentDiscountMinor: 0,
      adjustmentTipMinor: 0,
      currency,
      expectedChargeMinor: chargeMinor,
      expectedDiscountMinor: discountMinor,
      expectedNetSalesMinor,
      expectedRefundMinor: isFinalRefundStatus(order.paymentStatus)
        ? amountMinor(order.refundAmount, currency)
        : 0,
      expectedTipMinor: tipMinor,
      paymentLedgerMinor: 0,
      recordedCollectedMinor: amountMinor(
        order.paymentCollectedAmount,
        currency,
      ),
      refundLedgerMinor: 0,
      summary,
    });
  }

  for (const adjustment of input.adjustments) {
    const order = orderReconciliations.get(adjustment.orderId);

    if (!order) {
      continue;
    }

    if (normalizeCurrency(adjustment.currency) !== order.currency) {
      order.summary.currencyMismatchEntries += 1;
      continue;
    }

    const signedAmount =
      amountMinor(adjustment.amount, order.currency) *
      (adjustment.entryKind === "REVERSAL" ? -1 : 1);

    if (adjustment.type === "DISCOUNT" || adjustment.type === "COMP") {
      order.adjustmentDiscountMinor += signedAmount;
    } else if (adjustment.type === "SERVICE_CHARGE") {
      order.adjustmentChargeMinor += signedAmount;
    } else {
      order.adjustmentTipMinor += signedAmount;
    }
  }

  for (const payment of input.payments) {
    const order = orderReconciliations.get(payment.orderId);

    if (!order) {
      continue;
    }

    if (normalizeCurrency(payment.currency) !== order.currency) {
      order.summary.currencyMismatchEntries += 1;
      continue;
    }

    order.paymentLedgerMinor += amountMinor(payment.amount, order.currency);
  }

  for (const refund of input.refunds) {
    const order = orderReconciliations.get(refund.orderId);

    if (!order) {
      continue;
    }

    if (normalizeCurrency(refund.currency) !== order.currency) {
      order.summary.currencyMismatchEntries += 1;
      continue;
    }

    const refundMinor = amountMinor(refund.amount, order.currency);

    if (refund.status === "SUCCEEDED") {
      order.refundLedgerMinor += refundMinor;
    } else if (refund.status === "PENDING") {
      order.summary.pendingRefundCount += 1;
      order.summary.pendingRefundMinor += refundMinor;
    } else {
      order.summary.failedRefundCount += 1;
    }
  }

  for (const order of orderReconciliations.values()) {
    const summary = order.summary;
    const netCollectedMinor =
      order.paymentLedgerMinor - order.refundLedgerMinor;

    summary.collectedPaymentMinor += order.paymentLedgerMinor;
    summary.refundedMinor += order.refundLedgerMinor;
    summary.netCollectedMinor += netCollectedMinor;
    summary.outstandingMinor += Math.max(
      order.expectedNetSalesMinor - netCollectedMinor,
      0,
    );
    summary.overpaymentMinor += Math.max(
      netCollectedMinor - order.expectedNetSalesMinor,
      0,
    );

    if (
      order.adjustmentDiscountMinor !== order.expectedDiscountMinor ||
      order.adjustmentChargeMinor !== order.expectedChargeMinor ||
      order.adjustmentTipMinor !== order.expectedTipMinor
    ) {
      summary.adjustmentMismatchOrders += 1;
    }

    if (order.paymentLedgerMinor !== order.recordedCollectedMinor) {
      summary.paymentMismatchOrders += 1;
    }

    if (order.refundLedgerMinor !== order.expectedRefundMinor) {
      summary.refundMismatchOrders += 1;
    }
  }

  const rows: FinancialReconciliationRow[] = [...summaries.values()]
    .sort((left, right) => left.currency.localeCompare(right.currency))
    .map((summary) => ({
      adjustmentMismatchOrders: summary.adjustmentMismatchOrders,
      billedTotal: minorUnitsToDecimal(summary.billedMinor, summary.currency),
      chargeTotal: minorUnitsToDecimal(summary.chargeMinor, summary.currency),
      collectedPaymentTotal: minorUnitsToDecimal(
        summary.collectedPaymentMinor,
        summary.currency,
      ),
      currency: summary.currency,
      currencyMismatchEntries: summary.currencyMismatchEntries,
      discountTotal: minorUnitsToDecimal(
        summary.discountMinor,
        summary.currency,
      ),
      failedRefundCount: summary.failedRefundCount,
      isReconciled:
        summary.adjustmentMismatchOrders === 0 &&
        summary.currencyMismatchEntries === 0 &&
        summary.failedRefundCount === 0 &&
        summary.paymentMismatchOrders === 0 &&
        summary.pendingRefundCount === 0 &&
        summary.refundMismatchOrders === 0,
      netCollectedTotal: minorUnitsToDecimal(
        summary.netCollectedMinor,
        summary.currency,
      ),
      netSalesTotal: minorUnitsToDecimal(
        summary.netSalesMinor,
        summary.currency,
      ),
      orderCount: summary.orderCount,
      outstandingBalance: minorUnitsToDecimal(
        summary.outstandingMinor,
        summary.currency,
      ),
      overpaymentAmount: minorUnitsToDecimal(
        summary.overpaymentMinor,
        summary.currency,
      ),
      paymentMismatchOrders: summary.paymentMismatchOrders,
      pendingRefundCount: summary.pendingRefundCount,
      pendingRefundTotal: minorUnitsToDecimal(
        summary.pendingRefundMinor,
        summary.currency,
      ),
      refundedTotal: minorUnitsToDecimal(
        summary.refundedMinor,
        summary.currency,
      ),
      refundMismatchOrders: summary.refundMismatchOrders,
      subtotalTotal: minorUnitsToDecimal(
        summary.subtotalMinor,
        summary.currency,
      ),
      taxTotal: minorUnitsToDecimal(summary.taxMinor, summary.currency),
      tipTotal: minorUnitsToDecimal(summary.tipMinor, summary.currency),
    }));

  return { missingSnapshotOrders, rows };
}
