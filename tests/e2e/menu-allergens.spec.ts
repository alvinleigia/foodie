import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { menuItemSchema } from "@/lib/validations/menu";

const categoryId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";
const milkId = "8e3b9db9-9ce5-4b9e-9cd5-c965c5dbd91c";

function validMenuItem() {
  return {
    categoryId,
    prepStationId: "",
    name: "Allergen test item",
    description: "",
    price: "9.99",
    imageUrl: "",
    sortOrder: 0,
    isActive: true,
    tagIds: [],
    allergens: [{ allergenId: milkId, declaration: "CONTAINS" as const }],
    modifierGroupIds: [],
    taxAssignmentMode: "DEFAULT" as const,
    taxDefinitionIds: [],
    fulfilmentTaxOverrides: [],
  };
}

test.describe("structured menu allergens", () => {
  test("accepts contains and may-contain declarations and rejects duplicates", () => {
    expect(menuItemSchema.safeParse(validMenuItem()).success).toBe(true);
    expect(
      menuItemSchema.safeParse({
        ...validMenuItem(),
        allergens: [
          { allergenId: milkId, declaration: "CONTAINS" },
          { allergenId: milkId, declaration: "MAY_CONTAIN" },
        ],
      }).success,
    ).toBe(false);
  });

  test("seeds the regulated catalogue and backfills legacy warnings", () => {
    const migration = readFileSync(
      "drizzle/0081_menu_allergens_and_dietary_labels.sql",
      "utf8",
    );
    for (const code of [
      "CELERY",
      "GLUTEN_CEREALS",
      "CRUSTACEANS",
      "EGGS",
      "FISH",
      "LUPIN",
      "MILK",
      "MOLLUSCS",
      "MUSTARD",
      "PEANUTS",
      "SESAME",
      "SOYBEANS",
      "SULPHITES",
      "TREE_NUTS",
    ]) {
      expect(migration).toContain(`('${code}'`);
    }
    expect(migration).toContain("'LEGACY_ALLERGEN'");
    expect(migration).toContain("WHEN 'contains-dairy' THEN 'MILK'");
    expect(migration).toContain("WHEN 'contains-nuts' THEN 'TREE_NUTS'");
  });

  test("serializes allergens while excluding legacy warnings from labels", () => {
    const menuSource = readFileSync("lib/menu.ts", "utf8");
    expect(menuSource).toContain("getMenuAllergensByItemId");
    expect(menuSource).toContain("allergens: allergensByItemId.get(item.id) ?? []");
    expect(menuSource).toContain(
      'inArray(menuTags.kind, ["DIETARY", "ATTRIBUTE"])',
    );
    expect(menuSource).toContain("assertMenuAllergensExist");
  });

  test("shows declarations in menu management and ordering views", () => {
    const managerSource = readFileSync(
      "components/staff/MenuManager.tsx",
      "utf8",
    );
    const orderSource = readFileSync(
      "components/order/OrderForm.tsx",
      "utf8",
    );
    const summarySource = readFileSync(
      "components/shared/AllergenSummary.tsx",
      "utf8",
    );
    expect(managerSource).toContain('label="Allergens"');
    expect(managerSource).toContain("setItemDraftAllergen");
    expect(orderSource).toContain("Tell restaurant staff about any food allergy");
    expect(orderSource).toContain("allergens={drink.allergens}");
    expect(summarySource).toContain("Contains:");
    expect(summarySource).toContain("May contain:");
  });
});
