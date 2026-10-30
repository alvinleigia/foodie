import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  stockTransferReceiptSchema,
  stockTransferSchema,
  stockTransferStatusSchema,
} from "@/lib/validations/inventory-stock-transfer";

const sourceIngredientId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";
const destinationIngredientId = "8e3b9db9-9ce5-4b9e-9cd5-c965c5dbd91c";
const destinationOrganizationId = "30d3d949-72cc-46c6-83a7-53f8b1f8e2aa";
const transferItemId = "a253c456-3a5f-4e26-bf29-929c7c71ddf9";

test.describe("inventory stock transfer foundation", () => {
  test("validates transfer lines and explicit lifecycle actions", () => {
    expect(
      stockTransferSchema.safeParse({
        destinationOrganizationId,
        notes: "Move prep stock",
        lines: [
          {
            sourceIngredientId,
            destinationIngredientId,
            quantity: "5.5",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      stockTransferSchema.safeParse({
        destinationOrganizationId,
        lines: [
          { sourceIngredientId, destinationIngredientId, quantity: "0" },
        ],
      }).success,
    ).toBe(false);
    expect(stockTransferStatusSchema.safeParse({ action: "SEND" }).success).toBe(
      true,
    );
    expect(
      stockTransferStatusSchema.safeParse({ action: "CANCEL" }).success,
    ).toBe(true);
    expect(
      stockTransferStatusSchema.safeParse({ action: "RECEIVE" }).success,
    ).toBe(false);
  });

  test("requires one receipt quantity per unique transfer line", () => {
    expect(
      stockTransferReceiptSchema.safeParse({
        lines: [{ transferItemId, receivedQuantity: "0" }],
      }).success,
    ).toBe(true);
    expect(
      stockTransferReceiptSchema.safeParse({
        lines: [
          { transferItemId, receivedQuantity: "2" },
          { transferItemId, receivedQuantity: "1" },
        ],
      }).success,
    ).toBe(false);
  });

  test("stores tenant-scoped transfer and movement relationships", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0079_inventory_stock_transfers.sql",
      "utf8",
    );

    expect(schemaSource).toContain("inventoryStockTransfers");
    expect(schemaSource).toContain("inventoryStockTransferItems");
    expect(migrationSource).toContain(
      "inventory_stock_transfer_items_transfer_scope_fk",
    );
    expect(migrationSource).toContain(
      "inventory_stock_transfer_items_source_ingredient_fk",
    );
    expect(migrationSource).toContain(
      "inventory_stock_transfer_items_destination_movement_fk",
    );
    expect(migrationSource).toContain("TRANSFER_OUT");
    expect(migrationSource).toContain("TRANSFER_IN");
  });

  test("uses row locks and atomic guarded stock movements", () => {
    const serviceSource = readFileSync("lib/inventory-stock-transfer.ts", "utf8");

    expect(serviceSource).toContain("getNextStockTransferNumber");
    expect(serviceSource).toContain("onConflictDoUpdate");
    expect(serviceSource).toContain('.for("update")');
    expect(serviceSource).toContain(
      "gte(inventoryIngredients.currentQuantity, line.quantity)",
    );
    expect(serviceSource).toContain('movementType: "TRANSFER_OUT"');
    expect(serviceSource).toContain('movementType: "TRANSFER_IN"');
    expect(serviceSource).toContain(
      "Source and destination ingredient units must match.",
    );
    expect(serviceSource).toContain(
      "Only an in-transit stock transfer can be received.",
    );
  });

  test("protects every stock-transfer route with inventory access", () => {
    const routePaths = [
      "app/api/inventory/stock-transfers/route.ts",
      "app/api/inventory/stock-transfers/[id]/route.ts",
      "app/api/inventory/stock-transfers/[id]/status/route.ts",
      "app/api/inventory/stock-transfers/[id]/receive/route.ts",
    ];

    for (const routePath of routePaths) {
      const source = readFileSync(routePath, "utf8");
      expect(source).toContain('requireStaffPermission("inventory.manage")');
      expect(source).toContain('"operations.inventory"');
    }
  });
});
