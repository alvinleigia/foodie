import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  calculateDiscountedOrderFinancials,
  findActiveDiscountAdjustment,
  getOrderAdjustmentEffectMinor,
  orderAdjustmentTypes,
  staffOrderAdjustmentReasonCodes,
} from "@/lib/order-adjustments";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("order adjustment ledger", () => {
  test("defines every supported financial adjustment type", () => {
    expect(orderAdjustmentTypes).toEqual([
      "DISCOUNT",
      "COMP",
      "SERVICE_CHARGE",
      "TIP",
    ]);
  });

  test("uses an unambiguous signed effect for applications and reversals", () => {
    expect(
      getOrderAdjustmentEffectMinor({
        amountMinor: 250,
        entryKind: "APPLY",
        type: "DISCOUNT",
      }),
    ).toBe(-250);
    expect(
      getOrderAdjustmentEffectMinor({
        amountMinor: 250,
        entryKind: "REVERSAL",
        type: "DISCOUNT",
      }),
    ).toBe(250);
    expect(
      getOrderAdjustmentEffectMinor({
        amountMinor: 300,
        entryKind: "APPLY",
        type: "SERVICE_CHARGE",
      }),
    ).toBe(300);
    expect(
      getOrderAdjustmentEffectMinor({
        amountMinor: 300,
        entryKind: "REVERSAL",
        type: "TIP",
      }),
    ).toBe(-300);
  });

  test("rejects invalid minor-unit amounts", () => {
    expect(() =>
      getOrderAdjustmentEffectMinor({
        amountMinor: 0,
        entryKind: "APPLY",
        type: "COMP",
      }),
    ).toThrow("positive minor-unit integer");
  });

  test("calculates percentage, fixed, and comp tax reductions", () => {
    expect(
      calculateDiscountedOrderFinancials({
        adjustment: {
          amountMinor: 100,
          calculation: "PERCENTAGE",
          rateBps: 1_000,
          type: "DISCOUNT",
        },
        subtotalAmountMinor: 1_000,
        taxAmountMinor: 200,
      }),
    ).toEqual({ discountAmountMinor: 100, taxAmountMinor: 180 });
    expect(
      calculateDiscountedOrderFinancials({
        adjustment: {
          amountMinor: 250,
          calculation: "FIXED_AMOUNT",
          rateBps: null,
          type: "DISCOUNT",
        },
        subtotalAmountMinor: 1_000,
        taxAmountMinor: 200,
      }),
    ).toEqual({ discountAmountMinor: 250, taxAmountMinor: 150 });
    expect(
      calculateDiscountedOrderFinancials({
        adjustment: {
          amountMinor: 1_000,
          calculation: "PERCENTAGE",
          rateBps: 10_000,
          type: "COMP",
        },
        subtotalAmountMinor: 1_000,
        taxAmountMinor: 200,
      }),
    ).toEqual({ discountAmountMinor: 1_000, taxAmountMinor: 0 });
  });

  test("finds only adjustment applications without a reversal", () => {
    const application = {
      entryKind: "APPLY" as const,
      id: "discount-1",
      reversesAdjustmentId: null,
      type: "DISCOUNT" as const,
    };

    expect(findActiveDiscountAdjustment([application])).toEqual(application);
    expect(
      findActiveDiscountAdjustment([
        {
          entryKind: "REVERSAL",
          id: "reversal-1",
          reversesAdjustmentId: application.id,
          type: "DISCOUNT",
        },
        application,
      ]),
    ).toBeNull();
  });

  test("provides controlled staff reason codes", () => {
    expect(staffOrderAdjustmentReasonCodes).toContain("PROMOTION");
    expect(staffOrderAdjustmentReasonCodes).toContain("SERVICE_RECOVERY");
    expect(staffOrderAdjustmentReasonCodes).toContain("MANAGER_COMP");
  });

  test("wires adjustments into tenant export and UAT reset", () => {
    const exportSource = readSource("lib", "company-data-export.ts");
    const resetSource = readSource("lib", "uat-reset.ts");
    const schemaSource = readSource("db", "schema.ts");

    expect(exportSource).toContain("orderAdjustments");
    expect(resetSource).toContain("delete(orderAdjustments)");
    expect(schemaSource).toContain("order_adjustments_reversal_unique");
    expect(schemaSource).toContain("order_adjustments_organization_idempotency_unique");
    expect(schemaSource).toContain("order_adjustments_item_order_organization_fk");
    expect(schemaSource).toContain("order_adjustments_reason_check");
  });

  test("blocks changes after payment collection starts and uses ledger totals for payment", () => {
    const adjustmentSource = readSource("lib", "staff-order-adjustments.ts");
    const paymentSource = readSource("lib", "staff-order-payments.ts");
    const routeSource = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "adjustment",
      "route.ts",
    );

    expect(adjustmentSource).toContain('.for("update")');
    expect(adjustmentSource).toContain("payment collection starts");
    expect(adjustmentSource).toContain("financialSnapshotAt: null");
    expect(adjustmentSource).toContain("order.discount_applied");
    expect(adjustmentSource).toContain("order.comp_applied");
    expect(paymentSource).toContain("getActiveStaffOrderAdjustment");
    expect(routeSource).toContain("requireStaffSession");
    expect(routeSource).toContain("removeStaffOrderAdjustment");
  });
});
