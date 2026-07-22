import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { buildOrderLineTaxSnapshot } from "@/lib/order-payments";
import { calculateTaxPricing } from "@/lib/tax-pricing";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("tax pricing modes", () => {
  test("extracts included tax without changing the listed total", () => {
    expect(calculateTaxPricing(1_200, 2_000, "INCLUSIVE")).toEqual({
      listedAmountMinor: 1_200,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 200,
      totalAmountMinor: 1_200,
    });
  });

  test("adds exclusive tax to the listed amount", () => {
    expect(calculateTaxPricing(1_000, 2_000, "EXCLUSIVE")).toEqual({
      listedAmountMinor: 1_000,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 200,
      totalAmountMinor: 1_200,
    });
  });

  test("uses the shared half-away-from-zero rule at a minor-unit tie", () => {
    expect(calculateTaxPricing(5, 1_000, "EXCLUSIVE")).toEqual({
      listedAmountMinor: 5,
      taxableAmountMinor: 5,
      taxAmountMinor: 1,
      totalAmountMinor: 6,
    });
  });

  test("preserves existing totals when the tax rate is zero", () => {
    expect(calculateTaxPricing(1_000, 0, "EXCLUSIVE")).toEqual({
      listedAmountMinor: 1_000,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 0,
      totalAmountMinor: 1_000,
    });
  });

  test("snapshots full line tax totals including quantity and modifiers", () => {
    expect(
      buildOrderLineTaxSnapshot(
        {
          drinkName: "Lunch",
          modifiers: [
            { modifierName: "Extra", priceDelta: "2.00", quantity: 1 },
          ],
          quantity: 2,
          unitPrice: "8.00",
        },
        "GBP",
        { pricingMode: "EXCLUSIVE", taxRateBps: 2_000 },
      ),
    ).toEqual({
      taxAmountSnapshot: "4.00",
      taxableAmountSnapshot: "20.00",
      taxRateBpsSnapshot: 2_000,
    });
  });

  test("keeps monetary snapshots nullable for an unpriced staff line", () => {
    expect(
      buildOrderLineTaxSnapshot(
        {
          drinkName: "Market item",
          modifiers: [],
          quantity: 1,
          unitPrice: null,
        },
        "GBP",
        { pricingMode: "INCLUSIVE", taxRateBps: 2_000 },
      ),
    ).toEqual({
      taxAmountSnapshot: null,
      taxableAmountSnapshot: null,
      taxRateBpsSnapshot: 2_000,
    });
  });

  test("snapshots pricing policy and reuses it for staff collection", () => {
    const orderRouteSource = readSource("app", "api", "orders", "route.ts");
    const staffPaymentSource = readSource("lib", "staff-order-payments.ts");
    const menuRouteSource = readSource("app", "api", "menu", "route.ts");

    expect(orderRouteSource).toContain("taxPricingModeSnapshot");
    expect(orderRouteSource).toContain("taxRateBpsSnapshot");
    expect(orderRouteSource).toContain("taxableAmountSnapshot");
    expect(orderRouteSource).toContain("taxAmountSnapshot");
    expect(staffPaymentSource).toContain("order.taxPricingModeSnapshot");
    expect(staffPaymentSource).toContain("order.taxRateBpsSnapshot");
    expect(menuRouteSource).toContain("getRestaurantTaxPricing");
    expect(menuRouteSource).toContain("taxPricing");
  });
});
