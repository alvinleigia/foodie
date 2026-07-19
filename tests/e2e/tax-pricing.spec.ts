import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

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

  test("preserves existing totals when the tax rate is zero", () => {
    expect(calculateTaxPricing(1_000, 0, "EXCLUSIVE")).toEqual({
      listedAmountMinor: 1_000,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 0,
      totalAmountMinor: 1_000,
    });
  });

  test("snapshots pricing policy and reuses it for staff collection", () => {
    const orderRouteSource = readSource("app", "api", "orders", "route.ts");
    const staffPaymentSource = readSource("lib", "staff-order-payments.ts");
    const menuRouteSource = readSource("app", "api", "menu", "route.ts");

    expect(orderRouteSource).toContain("taxPricingModeSnapshot");
    expect(orderRouteSource).toContain("taxRateBpsSnapshot");
    expect(staffPaymentSource).toContain("order.taxPricingModeSnapshot");
    expect(staffPaymentSource).toContain("order.taxRateBpsSnapshot");
    expect(menuRouteSource).toContain("getRestaurantTaxPricing");
    expect(menuRouteSource).toContain("taxPricing");
  });
});
