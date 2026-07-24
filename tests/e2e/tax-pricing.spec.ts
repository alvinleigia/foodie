import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { buildOrderLineTaxSnapshot } from "@/lib/order-payments";
import {
  calculateMultiTaxPricing,
  calculateTaxPricing,
  type TaxComponentInput,
} from "@/lib/tax-pricing";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("tax pricing modes", () => {
  const vat: TaxComponentInput = {
    calculationOrder: 0,
    code: "VAT",
    definitionId: "vat-definition",
    isCompound: false,
    name: "VAT",
    rateBps: 2_000,
    treatment: "TAXABLE",
  };

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

  test("adds multiple exclusive taxes to the same taxable amount", () => {
    expect(
      calculateMultiTaxPricing(
        1_000,
        [
          { ...vat, code: "LOCAL", name: "Local tax", rateBps: 500 },
          { ...vat, code: "VAT", name: "VAT", rateBps: 1_000 },
        ],
        "EXCLUSIVE",
      ),
    ).toMatchObject({
      listedAmountMinor: 1_000,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 150,
      totalAmountMinor: 1_150,
      components: [
        { code: "LOCAL", taxableAmountMinor: 1_000, taxAmountMinor: 50 },
        { code: "VAT", taxableAmountMinor: 1_000, taxAmountMinor: 100 },
      ],
    });
  });

  test("extracts multiple included taxes from one listed amount", () => {
    expect(
      calculateMultiTaxPricing(
        1_250,
        [vat, { ...vat, code: "LOCAL", name: "Local tax", rateBps: 500 }],
        "INCLUSIVE",
      ),
    ).toMatchObject({
      listedAmountMinor: 1_250,
      taxableAmountMinor: 1_000,
      taxAmountMinor: 250,
      totalAmountMinor: 1_250,
      components: [
        { code: "LOCAL", taxableAmountMinor: 1_000, taxAmountMinor: 50 },
        { code: "VAT", taxableAmountMinor: 1_000, taxAmountMinor: 200 },
      ],
    });
  });

  test("applies compound tax after earlier tax components", () => {
    expect(
      calculateMultiTaxPricing(
        1_000,
        [
          { ...vat, code: "BASE", name: "Base tax", rateBps: 1_000 },
          {
            ...vat,
            calculationOrder: 1,
            code: "COMPOUND",
            isCompound: true,
            name: "Compound tax",
            rateBps: 1_000,
          },
        ],
        "EXCLUSIVE",
      ),
    ).toMatchObject({
      taxAmountMinor: 210,
      totalAmountMinor: 1_210,
      components: [
        { code: "BASE", taxableAmountMinor: 1_000, taxAmountMinor: 100 },
        { code: "COMPOUND", taxableAmountMinor: 1_100, taxAmountMinor: 110 },
      ],
    });
  });

  test("records exempt treatment without charging tax", () => {
    expect(
      calculateMultiTaxPricing(
        1_000,
        [{ ...vat, code: "EXEMPT", name: "Exempt", treatment: "EXEMPT" }],
        "EXCLUSIVE",
      ),
    ).toMatchObject({
      taxableAmountMinor: 1_000,
      taxAmountMinor: 0,
      totalAmountMinor: 1_000,
      components: [
        { code: "EXEMPT", taxableAmountMinor: 0, taxAmountMinor: 0 },
      ],
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
      components: [
        {
          calculationOrder: 0,
          code: "DEFAULT",
          definitionId: null,
          isCompound: false,
          name: "Tax",
          rateBps: 2_000,
          taxAmountSnapshot: "4.00",
          taxableAmountSnapshot: "20.00",
          treatment: "TAXABLE",
        },
      ],
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
      components: [],
      taxAmountSnapshot: null,
      taxableAmountSnapshot: null,
      taxRateBpsSnapshot: 2_000,
    });
  });

  test("snapshots pricing policy and reuses it for staff collection", () => {
    const orderRouteSource = readSource("app", "api", "orders", "route.ts");
    const staffPaymentSource = readSource("lib", "staff-order-payments.ts");
    const menuRouteSource = readSource("app", "api", "menu", "route.ts");
    const orderFormSource = readSource(
      "components",
      "order",
      "OrderForm.tsx",
    );

    expect(orderRouteSource).toContain("taxPricingModeSnapshot");
    expect(orderRouteSource).toContain("taxRateBpsSnapshot");
    expect(orderRouteSource).toContain("taxableAmountSnapshot");
    expect(orderRouteSource).toContain("taxAmountSnapshot");
    expect(orderRouteSource).toContain("orderItemTaxComponents");
    expect(orderRouteSource).toContain("getResolvedRestaurantTaxes");
    expect(staffPaymentSource).toContain("order.taxPricingModeSnapshot");
    expect(staffPaymentSource).toContain("order.taxRateBpsSnapshot");
    expect(staffPaymentSource).toContain("orderItemTaxComponents");
    expect(menuRouteSource).toContain("getResolvedRestaurantTaxes");
    expect(menuRouteSource).toContain("taxesByMenuItemId");
    expect(orderFormSource).toContain("calculateMultiTaxPricing");
    expect(orderFormSource).toContain("item.taxes");
  });
});
