import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  assertOrderFinancialSnapshotMatches,
  buildOrderFinancialSnapshot,
} from "@/lib/order-financial-snapshots";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("order financial snapshots", () => {
  test("stores a tax-exclusive subtotal and composes the final total", () => {
    expect(
      buildOrderFinancialSnapshot({
        chargeAmountMinor: 50,
        currency: "gbp",
        discountAmountMinor: 100,
        subtotalAmountMinor: 1_000,
        taxAmountMinor: 200,
        tipAmountMinor: 25,
      }),
    ).toEqual({
      chargeAmountSnapshot: "0.50",
      discountAmountSnapshot: "1.00",
      finalTotalAmountSnapshot: "11.75",
      financialSnapshotCurrency: "GBP",
      subtotalAmountSnapshot: "10.00",
      taxAmountSnapshot: "2.00",
      tipAmountSnapshot: "0.25",
    });
  });

  test("rejects negative amounts and discounts above the subtotal", () => {
    expect(() =>
      buildOrderFinancialSnapshot({
        currency: "GBP",
        subtotalAmountMinor: -1,
        taxAmountMinor: 0,
      }),
    ).toThrow("non-negative minor-unit integers");

    expect(() =>
      buildOrderFinancialSnapshot({
        currency: "GBP",
        discountAmountMinor: 101,
        subtotalAmountMinor: 100,
        taxAmountMinor: 0,
      }),
    ).toThrow("cannot exceed the subtotal");
  });

  test("detects any mutation of a finalized financial composition", () => {
    const snapshot = buildOrderFinancialSnapshot({
      currency: "GBP",
      subtotalAmountMinor: 1_000,
      taxAmountMinor: 200,
    });

    expect(() =>
      assertOrderFinancialSnapshotMatches({
        current: snapshot,
        expected: { ...snapshot, tipAmountSnapshot: "1.00" },
      }),
    ).toThrow("finalized bill totals");
  });

  test("finalizes customer, cash and successful Stripe snapshots", () => {
    const orderRoute = readSource("app", "api", "orders", "route.ts");
    const staffPayments = readSource("lib", "staff-order-payments.ts");
    const orderPayments = readSource("lib", "order-payments.ts");
    const migration = readSource(
      "drizzle",
      "0044_order_financial_snapshots.sql",
    );

    expect(orderRoute).toContain("customerFinancialSnapshot");
    expect(orderRoute).toContain("financialSnapshotAt: now");
    expect(staffPayments).toContain("resolveStaffOrderFinancialSnapshot");
    expect(staffPayments).toContain("financialSnapshotAt: now");
    expect(orderPayments).toContain("lockedOrder.finalTotalAmountSnapshot");
    expect(orderPayments).toContain("emptyOrderFinancialSnapshot");
    expect(migration).toContain("orders_financial_snapshot_immutable");
    expect(migration).toContain(
      "Finalized order financial snapshots cannot be changed.",
    );
  });
});
