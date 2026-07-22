import { expect, test } from "@playwright/test";

import {
  allocateRefundAcrossPayments,
  calculateCancellationAmounts,
} from "@/lib/order-cancellation-financials";
import { getStripeApplicationFeeRefundParams } from "@/lib/stripe-refund-policy";

test.describe("order cancellation financials", () => {
  test("calculates a full refund when no fee applies", () => {
    expect(
      calculateCancellationAmounts({
        amount: "10.00",
        currency: "GBP",
        feeBps: 0,
      }),
    ).toMatchObject({
      feeAmount: "0.00",
      feeMinor: 0,
      refundAmount: "10.00",
      refundMinor: 1000,
    });
  });

  test("rounds a partial refund in currency minor units", () => {
    expect(
      calculateCancellationAmounts({
        amount: "9.99",
        currency: "GBP",
        feeBps: 1250,
      }),
    ).toMatchObject({
      feeAmount: "1.25",
      feeMinor: 125,
      refundAmount: "8.74",
      refundMinor: 874,
    });
  });

  test("uses the shared half-away-from-zero rule at a minor-unit tie", () => {
    expect(
      calculateCancellationAmounts({
        amount: "0.05",
        currency: "GBP",
        feeBps: 1_000,
      }),
    ).toMatchObject({
      feeAmount: "0.01",
      feeMinor: 1,
      refundAmount: "0.04",
      refundMinor: 4,
    });
  });

  test("supports zero-decimal currencies", () => {
    expect(
      calculateCancellationAmounts({
        amount: "501",
        currency: "JPY",
        feeBps: 1250,
      }),
    ).toMatchObject({
      feeAmount: "63",
      feeMinor: 63,
      refundAmount: "438",
      refundMinor: 438,
    });
  });

  test("retains the full amount at the maximum disclosed fee", () => {
    expect(
      calculateCancellationAmounts({
        amount: "10.00",
        currency: "GBP",
        feeBps: 10_000,
      }),
    ).toMatchObject({
      feeAmount: "10.00",
      refundAmount: "0.00",
      refundMinor: 0,
    });
  });

  test("rejects a fee outside the supported range", () => {
    expect(() =>
      calculateCancellationAmounts({
        amount: "10.00",
        currency: "GBP",
        feeBps: 10_001,
      }),
    ).toThrow("Cancellation fee must be between 0% and 100%.");
  });

  test("allocates a mixed refund across the original payment portions", () => {
    expect(
      allocateRefundAcrossPayments({
        currency: "GBP",
        payments: [
          { amount: "6.00", id: "stripe-payment", method: "STRIPE_CHECKOUT" },
          { amount: "4.00", id: "cash-payment", method: "CASH" },
        ],
        refundAmount: "9.00",
      }),
    ).toEqual([
      {
        amount: "6.00",
        amountMinor: 600,
        method: "STRIPE_CHECKOUT",
        orderPaymentId: "stripe-payment",
      },
      {
        amount: "3.00",
        amountMinor: 300,
        method: "CASH",
        orderPaymentId: "cash-payment",
      },
    ]);
  });

  test("rejects a refund not covered by successful payments", () => {
    expect(() =>
      allocateRefundAcrossPayments({
        currency: "GBP",
        payments: [{ amount: "4.00", id: "cash-payment", method: "CASH" }],
        refundAmount: "4.01",
      }),
    ).toThrow("Successful payments do not cover the refund amount.");
  });

  test("does not request an application fee refund when no fee was collected", () => {
    expect(getStripeApplicationFeeRefundParams(null)).toEqual({});
    expect(getStripeApplicationFeeRefundParams(0)).toEqual({});
  });

  test("refunds a collected Stripe application fee with the charge", () => {
    expect(getStripeApplicationFeeRefundParams(25)).toEqual({
      refund_application_fee: true,
    });
  });
});
