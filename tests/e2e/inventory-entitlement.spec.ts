import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getStaffNavigationItemsForRestaurant } from "../../lib/staff-navigation";

function readSource(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

test.describe("inventory entitlement", () => {
  test("removes inventory management from restaurant navigation", () => {
    const navigation = getStaffNavigationItemsForRestaurant("snack-shack", {
      inventoryEnabled: false,
    });

    expect(navigation.some((item) => item.label === "Inventory")).toBe(false);
  });

  test("gates inventory management and suppresses automatic stock state", () => {
    const apiSource = readSource("app", "api", "inventory", "route.ts");
    const pageSource = readSource(
      "app",
      "restaurants",
      "[restaurantSlug]",
      "inventory",
      "page.tsx",
    );
    const menuRouteSource = readSource("app", "api", "menu", "route.ts");
    const menuSource = readSource("lib", "menu.ts");

    expect(apiSource.match(/"operations\.inventory"/g)).toHaveLength(2);
    expect(apiSource).toContain("FeatureEntitlementError");
    expect(pageSource).toContain('"operations.inventory"');
    expect(pageSource).toContain("notFound()");
    expect(menuRouteSource).toContain("includeInventory: inventoryEntitlement.enabled");
    expect(menuSource).toContain("options.includeInventory === false");
  });

  test("skips new reservations when disabled but preserves reservation cleanup", () => {
    const orderSource = readSource("app", "api", "orders", "route.ts");
    const orderCorrectionSource = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "correct",
      "route.ts",
    );
    const itemCorrectionSource = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "items",
      "[itemId]",
      "correct",
      "route.ts",
    );
    const itemStatusSource = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "items",
      "[itemId]",
      "status",
      "route.ts",
    );

    expect(orderSource).toContain("{ includeInventory: inventoryEnabled }");
    expect(orderCorrectionSource).toContain("inventoryEnabled &&");
    expect(itemCorrectionSource).toContain("inventoryEnabled &&");
    expect(itemStatusSource).toContain("restoreReservedInventoryForOrderItem");
  });
});
