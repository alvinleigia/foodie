import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  ingredientMovementSchema,
  ingredientSchema,
  recipeSchema,
} from "@/lib/validations/ingredient-inventory";

const ingredientId = "8e3b9db9-9ce5-4b9e-9cd5-c965c5dbd91c";
const productId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";

test.describe("ingredient and recipe inventory foundation", () => {
  test("validates ingredient stock and positive recipe quantities", () => {
    expect(
      ingredientSchema.safeParse({
        name: "Beef patty",
        unit: "g",
        currentQuantity: "12000",
        lowStockThreshold: "2000",
        notes: "Keep chilled",
        isActive: true,
      }).success,
    ).toBe(true);
    expect(
      ingredientSchema.safeParse({
        name: "Beef patty",
        unit: "g",
        currentQuantity: "-1",
        lowStockThreshold: "0",
        notes: "",
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      recipeSchema.safeParse({
        menuItemId: productId,
        ingredients: [{ ingredientId, quantity: "150" }],
      }).success,
    ).toBe(true);
    expect(
      recipeSchema.safeParse({
        menuItemId: productId,
        ingredients: [{ ingredientId, quantity: "0" }],
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate ingredient lines in one recipe", () => {
    expect(
      recipeSchema.safeParse({
        menuItemId: productId,
        ingredients: [
          { ingredientId, quantity: "100" },
          { ingredientId, quantity: "50" },
        ],
      }).success,
    ).toBe(false);
  });

  test("validates receipts, waste, adjustments and stock counts", () => {
    expect(
      ingredientMovementSchema.safeParse({
        ingredientId,
        action: "RECEIPT",
        quantity: "250",
        reason: "Supplier delivery",
      }).success,
    ).toBe(true);
    expect(
      ingredientMovementSchema.safeParse({
        ingredientId,
        action: "ADJUSTMENT",
        quantity: "-25",
        reason: "Corrected unit count",
      }).success,
    ).toBe(true);
    expect(
      ingredientMovementSchema.safeParse({
        ingredientId,
        action: "STOCKTAKE",
        quantity: "0",
        reason: "End of day count",
      }).success,
    ).toBe(true);
    expect(
      ingredientMovementSchema.safeParse({
        ingredientId,
        action: "WASTE",
        quantity: "-1",
        reason: "Damaged",
      }).success,
    ).toBe(false);
  });

  test("enforces restaurant ownership in storage and services", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0074_ingredient_recipe_inventory.sql",
      "utf8",
    );
    const serviceSource = readFileSync("lib/ingredient-inventory.ts", "utf8");

    expect(schemaSource).toContain("inventoryIngredients");
    expect(schemaSource).toContain("menuItemIngredients");
    expect(migrationSource).toContain(
      'CONSTRAINT "menu_item_ingredients_item_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CONSTRAINT "menu_item_ingredients_ingredient_organization_fk"',
    );
    expect(serviceSource).toContain(
      "eq(inventoryIngredients.organizationId, context.organizationId)",
    );
    expect(serviceSource).toContain(
      "eq(menuItemIngredients.organizationId, context.organizationId)",
    );
  });

  test("protects ingredient and recipe APIs with inventory access", () => {
    const ingredientRouteSource = readFileSync(
      "app/api/inventory/ingredients/route.ts",
      "utf8",
    );
    const recipeRouteSource = readFileSync(
      "app/api/inventory/recipes/route.ts",
      "utf8",
    );
    const serviceSource = readFileSync("lib/ingredient-inventory.ts", "utf8");

    expect(ingredientRouteSource).toContain(
      'requireStaffPermission("inventory.manage")',
    );
    expect(recipeRouteSource).toContain(
      'requireStaffPermission("inventory.manage")',
    );
    expect(ingredientRouteSource).toContain('"operations.inventory"');
    expect(recipeRouteSource).toContain('"operations.inventory"');
    expect(serviceSource).toContain("db.transaction(async (transaction)");
    expect(serviceSource).toContain("delete(menuItemIngredients)");
  });

  test("stores immutable order-item ingredient reservations", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0075_ingredient_inventory_depletion.sql",
      "utf8",
    );
    const serviceSource = readFileSync("lib/ingredient-inventory.ts", "utf8");

    expect(schemaSource).toContain("orderItemIngredientReservations");
    expect(schemaSource).toContain("ingredientInventoryReservedAt");
    expect(migrationSource).toContain("ingredient_name_snapshot");
    expect(migrationSource).toContain("unit_snapshot");
    expect(migrationSource).toContain(
      'CONSTRAINT "order_item_ingredient_reservations_item_order_org_fk"',
    );
    expect(serviceSource).toContain("reserveIngredientsForOrderItem");
    expect(serviceSource).toContain("restoreIngredientsForOrderItem");
    expect(serviceSource).toContain("reservation.quantity");
  });

  test("wires ingredient stock into every order reservation lifecycle", () => {
    const orderRoute = readFileSync("app/api/orders/route.ts", "utf8");
    const itemStatusRoute = readFileSync(
      "app/api/orders/[id]/items/[itemId]/status/route.ts",
      "utf8",
    );
    const itemCorrectionRoute = readFileSync(
      "app/api/orders/[id]/items/[itemId]/correct/route.ts",
      "utf8",
    );
    const orderCorrectionRoute = readFileSync(
      "app/api/orders/[id]/correct/route.ts",
      "utf8",
    );
    const cancellationSource = readFileSync("lib/order-cancellation.ts", "utf8");
    const paymentSource = readFileSync("lib/order-payments.ts", "utf8");

    expect(orderRoute).toContain("reserveIngredientsForOrderItem");
    expect(itemStatusRoute).toContain("restoreIngredientsForOrderItem");
    expect(itemCorrectionRoute).toContain("reserveIngredientsForOrderItem");
    expect(orderCorrectionRoute).toContain("reserveIngredientsForOrderItem");
    expect(cancellationSource).toContain("restoreIngredientsForOrderItem");
    expect(cancellationSource).toContain(
      "currency: financials ? order.paymentCurrency : null",
    );
    expect(paymentSource).toContain("restoreIngredientsForOrderItem");
  });

  test("records every stock change in an immutable movement ledger", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0076_ingredient_stock_movements.sql",
      "utf8",
    );
    const serviceSource = readFileSync("lib/ingredient-inventory.ts", "utf8");
    const routeSource = readFileSync(
      "app/api/inventory/movements/route.ts",
      "utf8",
    );

    expect(schemaSource).toContain("inventoryIngredientMovements");
    expect(migrationSource).toContain(
      'CONSTRAINT "inventory_ingredient_movements_quantities_check"',
    );
    expect(migrationSource).toContain(
      'CONSTRAINT "inventory_ingredient_movements_manual_reason_check"',
    );
    expect(migrationSource).toContain('"reason" IS NOT NULL');
    expect(serviceSource).toContain("recordIngredientMovement");
    expect(serviceSource).toContain('movementType: "SALE"');
    expect(serviceSource).toContain('movementType: "RESTORE"');
    expect(serviceSource).toContain(
      "Use a stock movement to change the current quantity.",
    );
    expect(routeSource).toContain('requireStaffPermission("inventory.manage")');
    expect(routeSource).toContain('"operations.inventory"');
  });
});
