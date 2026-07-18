import { expect, test } from "@playwright/test";

import { calculateCancellationAmounts } from "@/lib/order-cancellation-financials";

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
});
