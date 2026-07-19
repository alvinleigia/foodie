import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  calculateCashSettlement,
  calculatePaymentBalance,
} from "@/lib/order-payment-financials";

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
    ).toThrow("Cash received must cover the amount being collected.");
  });

  test("calculates the collected and remaining portions of a bill", () => {
    expect(
      calculatePaymentBalance({
        amount: "10.00",
        collectedAmount: "4.25",
        currency: "GBP",
      }),
    ).toMatchObject({
      amountMinor: 1000,
      collectedAmount: "4.25",
      collectedMinor: 425,
      remainingAmount: "5.75",
      remainingMinor: 575,
    });

    expect(() =>
      calculatePaymentBalance({
        amount: "10.00",
        collectedAmount: "10.01",
        currency: "GBP",
      }),
    ).toThrow("Collected payments exceed the bill total.");
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
    expect(source).toContain('order.paymentStatus !== "PARTIALLY_PAID"');
    expect(source).toContain("paymentCollectedAmount");
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

    expect(staffBranch).toContain('("PARTIALLY_PAID" as const)');
    expect(staffBranch).toContain('("UNPAID" as const)');
    expect(staffBranch).not.toContain("update(orderItems)");
  });

  test("allocates mixed-payment returns to their original payments", () => {
    const source = readSource("lib", "order-cancellation.ts");

    expect(source).toContain("allocateRefundAcrossPayments");
    expect(source).toContain("orderPaymentId: allocation.orderPaymentId");
    expect(source).toContain('provider: isCash ? "CASH" : "STRIPE"');
    expect(source).toContain('status: isCash ? "SUCCEEDED" : "PENDING"');
  });

  test("requires every refund to reference its original payment", () => {
    const cancellationSource = readSource("lib", "order-cancellation.ts");
    const schemaSource = readSource("db", "schema.ts");

    expect(schemaSource).toMatch(
      /orderPaymentId: uuid\("order_payment_id"\)[\s\S]*?\.references\(\(\) => orderPayments\.id, \{ onDelete: "restrict" \}\)[\s\S]*?\.notNull\(\)/,
    );
    expect(cancellationSource).toContain(".innerJoin(orderPayments");
    expect(cancellationSource).not.toContain(".leftJoin(orderPayments");
    expect(cancellationSource).not.toContain("legacy-stripe-payment");
    expect(cancellationSource).not.toContain("operation.payment?.");
  });

  test("blocks item reopenings after payment collection starts", () => {
    const source = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "items",
      "[itemId]",
      "correct",
      "route.ts",
    );

    expect(source).toContain(
      "A cancelled item cannot be reopened after payment collection has started.",
    );
    expect(source).toContain('lockedOrder.paymentStatus !== "UNPAID"');
  });

  test("renders the exact Stripe Checkout link as a payment QR", () => {
    const source = readSource(
      "components",
      "staff",
      "StaffOrderBoard.tsx",
    );

    expect(source).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(source).toContain("value={checkoutUrl}");
    expect(source).toContain('marginSize={4}');
    expect(source).toContain("Scan to pay");
  });

  test("gates new Stripe sessions without blocking pending link recovery", () => {
    const customerOrderSource = readSource("app", "api", "orders", "route.ts");
    const staffPaymentSource = readSource("lib", "staff-order-payments.ts");
    const pendingPaymentBranch = staffPaymentSource.indexOf(
      'if (order.paymentStatus === "PENDING")',
    );
    const entitlementCheck = staffPaymentSource.indexOf(
      '"payments.stripe"',
      pendingPaymentBranch,
    );

    expect(customerOrderSource).toContain('"payments.stripe"');
    expect(pendingPaymentBranch).toBeGreaterThan(-1);
    expect(entitlementCheck).toBeGreaterThan(pendingPaymentBranch);

    for (const segments of [
      ["app", "api", "company", "integrations", "stripe", "route.ts"],
      [
        "app",
        "api",
        "company",
        "restaurants",
        "[id]",
        "integrations",
        "stripe",
        "route.ts",
      ],
      ["app", "api", "tenant", "admin", "integrations", "stripe", "route.ts"],
    ]) {
      const source = readSource(...segments);

      expect(source).toContain("assertOrganizationFeatureEnabled");
      expect(source).toContain("FeatureEntitlementError");
    }
  });
});
