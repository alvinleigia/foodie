import { expect, test } from "@playwright/test";

import { menuItemSchema } from "@/lib/validations/menu";

const validItem = {
  categoryId: "11111111-1111-4111-8111-111111111111",
  name: "Lunch special",
};

test.describe("menu item tax assignment validation", () => {
  test("uses restaurant defaults when no assignment is supplied", () => {
    const parsed = menuItemSchema.parse(validItem);

    expect(parsed.taxAssignmentMode).toBe("DEFAULT");
    expect(parsed.taxDefinitionIds).toEqual([]);
    expect(parsed.fulfilmentTaxOverrides).toEqual([]);
  });

  test("requires at least one tax for a custom assignment", () => {
    const parsed = menuItemSchema.safeParse({
      ...validItem,
      taxAssignmentMode: "CUSTOM",
      taxDefinitionIds: [],
    });

    expect(parsed.success).toBe(false);
    expect(
      parsed.error?.flatten().fieldErrors.taxDefinitionIds,
    ).toContain("Choose at least one tax for this product");
  });

  test("accepts explicit item-level taxes", () => {
    const taxDefinitionIds = [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const parsed = menuItemSchema.parse({
      ...validItem,
      taxAssignmentMode: "CUSTOM",
      taxDefinitionIds,
    });

    expect(parsed.taxAssignmentMode).toBe("CUSTOM");
    expect(parsed.taxDefinitionIds).toEqual(taxDefinitionIds);
  });

  test("requires a tax for each fulfilment exception", () => {
    const parsed = menuItemSchema.safeParse({
      ...validItem,
      fulfilmentTaxOverrides: [
        {
          fulfilmentType: "TAKEAWAY",
          taxDefinitionIds: [],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(
      parsed.error?.flatten().fieldErrors.fulfilmentTaxOverrides,
    ).toContain("Choose at least one tax for this fulfilment exception");
  });

  test("rejects duplicate exceptions for one fulfilment type", () => {
    const parsed = menuItemSchema.safeParse({
      ...validItem,
      fulfilmentTaxOverrides: [
        {
          fulfilmentType: "DELIVERY",
          taxDefinitionIds: ["22222222-2222-4222-8222-222222222222"],
        },
        {
          fulfilmentType: "DELIVERY",
          taxDefinitionIds: ["33333333-3333-4333-8333-333333333333"],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(
      parsed.error?.flatten().fieldErrors.fulfilmentTaxOverrides,
    ).toContain("Only one tax exception is allowed per fulfilment type");
  });

  test("accepts taxes that replace the normal assignment for a fulfilment type", () => {
    const fulfilmentTaxOverrides = [
      {
        fulfilmentType: "DINE_IN" as const,
        taxDefinitionIds: ["22222222-2222-4222-8222-222222222222"],
      },
      {
        fulfilmentType: "TAKEAWAY" as const,
        taxDefinitionIds: ["33333333-3333-4333-8333-333333333333"],
      },
    ];
    const parsed = menuItemSchema.parse({
      ...validItem,
      fulfilmentTaxOverrides,
    });

    expect(parsed.fulfilmentTaxOverrides).toEqual(fulfilmentTaxOverrides);
  });
});
