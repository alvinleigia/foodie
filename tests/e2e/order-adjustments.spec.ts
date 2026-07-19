import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  getOrderAdjustmentEffectMinor,
  orderAdjustmentTypes,
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
});
