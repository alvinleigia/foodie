import { expect, test } from "@playwright/test";

import {
  reconcileFinancialLedgers,
  type FinancialOrderLedgerRow,
} from "@/lib/financial-reconciliation";

function financialOrder(
  overrides: Partial<FinancialOrderLedgerRow> = {},
): FinancialOrderLedgerRow {
  return {
    cancellationFeeAmount: null,
    chargeAmountSnapshot: "0.00",
    discountAmountSnapshot: "0.00",
    finalTotalAmountSnapshot: "10.00",
    financialSnapshotCurrency: "GBP",
    id: "order-1",
    paymentCollectedAmount: "10.00",
    paymentCurrency: "GBP",
    paymentStatus: "PAID",
    refundAmount: null,
    status: "DELIVERED",
    subtotalAmountSnapshot: "10.00",
    taxAmountSnapshot: "0.00",
    tipAmountSnapshot: "0.00",
    ...overrides,
  };
}

test.describe("financial report reconciliation", () => {
  test("reconciles completed and cancelled orders from all financial ledgers", () => {
    const report = reconcileFinancialLedgers({
      adjustments: [
        {
          amount: "1.00",
          currency: "GBP",
          entryKind: "APPLY",
          orderId: "delivered-order",
          type: "SERVICE_CHARGE",
        },
      ],
      orders: [
        financialOrder({
          chargeAmountSnapshot: "1.00",
          finalTotalAmountSnapshot: "12.00",
          id: "delivered-order",
          paymentCollectedAmount: "12.00",
          subtotalAmountSnapshot: "10.00",
          taxAmountSnapshot: "1.00",
        }),
        financialOrder({
          cancellationFeeAmount: "1.00",
          id: "cancelled-order",
          paymentStatus: "REFUNDED",
          refundAmount: "9.00",
          status: "CANCELLED",
        }),
      ],
      payments: [
        {
          amount: "12.00",
          currency: "GBP",
          orderId: "delivered-order",
        },
        {
          amount: "10.00",
          currency: "GBP",
          orderId: "cancelled-order",
        },
      ],
      refunds: [
        {
          amount: "9.00",
          currency: "GBP",
          orderId: "cancelled-order",
          status: "SUCCEEDED",
        },
      ],
    });

    expect(report.missingSnapshotOrders).toBe(0);
    expect(report.rows).toEqual([
      expect.objectContaining({
        adjustmentMismatchOrders: 0,
        billedTotal: "22.00",
        collectedPaymentTotal: "22.00",
        currency: "GBP",
        isReconciled: true,
        netCollectedTotal: "13.00",
        netSalesTotal: "13.00",
        orderCount: 2,
        outstandingBalance: "0.00",
        overpaymentAmount: "0.00",
        paymentMismatchOrders: 0,
        refundedTotal: "9.00",
        refundMismatchOrders: 0,
      }),
    ]);
  });

  test("flags snapshot, payment, refund, and currency discrepancies", () => {
    const report = reconcileFinancialLedgers({
      adjustments: [],
      orders: [
        financialOrder({
          discountAmountSnapshot: "1.00",
          finalTotalAmountSnapshot: "9.00",
          paymentStatus: "PARTIALLY_REFUNDED",
          refundAmount: "2.00",
        }),
      ],
      payments: [
        { amount: "9.00", currency: "GBP", orderId: "order-1" },
        { amount: "1.00", currency: "USD", orderId: "order-1" },
      ],
      refunds: [
        {
          amount: "1.00",
          currency: "GBP",
          orderId: "order-1",
          status: "SUCCEEDED",
        },
        {
          amount: "1.00",
          currency: "GBP",
          orderId: "order-1",
          status: "PENDING",
        },
      ],
    });

    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        adjustmentMismatchOrders: 1,
        currencyMismatchEntries: 1,
        isReconciled: false,
        paymentMismatchOrders: 1,
        pendingRefundCount: 1,
        refundMismatchOrders: 1,
      }),
    );
  });

  test("separates currencies and reports orders without finalized snapshots", () => {
    const report = reconcileFinancialLedgers({
      adjustments: [],
      orders: [
        financialOrder(),
        financialOrder({
          finalTotalAmountSnapshot: "500",
          financialSnapshotCurrency: "JPY",
          id: "jpy-order",
          paymentCollectedAmount: "500",
          paymentCurrency: "JPY",
          subtotalAmountSnapshot: "500",
        }),
        financialOrder({
          finalTotalAmountSnapshot: null,
          id: "missing-snapshot",
        }),
      ],
      payments: [
        { amount: "10.00", currency: "GBP", orderId: "order-1" },
        { amount: "500", currency: "JPY", orderId: "jpy-order" },
      ],
      refunds: [],
    });

    expect(report.missingSnapshotOrders).toBe(1);
    expect(report.rows.map((row) => row.currency)).toEqual(["GBP", "JPY"]);
    expect(report.rows[1].netCollectedTotal).toBe("500");
  });
});
