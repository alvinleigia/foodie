import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { calculateCashSettlement } from "@/lib/order-payment-financials";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("staff bill payment policy", () => {
  test("calculates exact cash and change in currency minor units", () => {
    expect(
      calculateCashSettlement({
        amount: "10.25",
        currency: "GBP",
        tenderedAmount: "20.00",
      }),
    ).toMatchObject({
      changeAmount: "9.75",
      changeMinor: 975,
      tenderedAmount: "20.00",
    });

    expect(
      calculateCashSettlement({
        amount: "501",
        currency: "JPY",
        tenderedAmount: "1000",
      }),
    ).toMatchObject({
      changeAmount: "499",
      changeMinor: 499,
    });
  });

  test("rejects insufficient cash", () => {
    expect(() =>
      calculateCashSettlement({
        amount: "10.00",
        currency: "GBP",
        tenderedAmount: "9.99",
      }),
    ).toThrow("Cash tendered must cover the full bill.");
  });

  test("creates staff orders as unpaid bills and customer orders as pending checkout", () => {
    const source = readSource("app", "api", "orders", "route.ts");

    expect(source).toContain(
      'session.user.kind === "customer" ? "PENDING" : "UNPAID"',
    );
    expect(source).toContain(".insert(orderPayments)");
    expect(source).toContain('method: "STRIPE_CHECKOUT"');
  });

  test("locks and compare-and-sets staff payment collection", () => {
    const source = readSource("lib", "staff-order-payments.ts");

    expect(source).toContain('.for("update")');
    expect(source).toContain('eq(orders.paymentStatus, "UNPAID")');
    expect(source).toContain(".insert(orderPayments)");
    expect(source).toContain('method: "CASH"');
    expect(source).toContain('method: "STRIPE_CHECKOUT"');
  });

  test("reopens an expired staff checkout without cancelling its order", () => {
    const source = readSource("lib", "order-payments.ts");
    const staffBranch = source.slice(
      source.indexOf('if (lockedOrder.source === "STAFF_CREATED")'),
      source.indexOf("const tenantContext =", source.indexOf('if (lockedOrder.source === "STAFF_CREATED")')),
    );

    expect(staffBranch).toContain('paymentStatus: "UNPAID"');
    expect(staffBranch).not.toContain("update(orderItems)");
  });

  test("records cash returns separately from Stripe refunds", () => {
    const source = readSource("lib", "order-cancellation.ts");

    expect(source).toContain('successfulPayment?.method === "CASH"');
    expect(source).toContain('provider: isCashPayment ? "CASH" : "STRIPE"');
    expect(source).toContain('status: isCashPayment ? "SUCCEEDED" : "PENDING"');
  });
});
