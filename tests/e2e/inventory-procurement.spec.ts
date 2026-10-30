import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  inventorySupplierSchema,
  purchaseOrderReceiptSchema,
  purchaseOrderSchema,
  purchaseOrderStatusSchema,
} from "@/lib/validations/inventory-procurement";

const supplierId = "8e3b9db9-9ce5-4b9e-9cd5-c965c5dbd91c";
const ingredientId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";
const purchaseOrderItemId = "30d3d949-72cc-46c6-83a7-53f8b1f8e2aa";
const idempotencyKey = "a253c456-3a5f-4e26-bf29-929c7c71ddf9";

test.describe("inventory procurement foundation", () => {
  test("validates suppliers and purchase-order lines", () => {
    expect(
      inventorySupplierSchema.safeParse({
        name: "Fresh Foods",
        contactName: "Alex",
        email: "orders@example.com",
        phone: "+44 20 7946 0000",
        accountReference: "REST-001",
        notes: "Tuesday delivery",
        isActive: true,
      }).success,
    ).toBe(true);
    expect(
      purchaseOrderSchema.safeParse({
        supplierId,
        expectedOn: "2026-11-02",
        notes: "Weekly order",
        lines: [
          {
            ingredientId,
            orderedQuantity: "10",
            unitCost: "2.50",
            notes: "",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      purchaseOrderSchema.safeParse({
        supplierId,
        expectedOn: "",
        notes: "",
        lines: [
          { ingredientId, orderedQuantity: "0", unitCost: "", notes: "" },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate ingredient and receipt lines", () => {
    expect(
      purchaseOrderSchema.safeParse({
        supplierId,
        lines: [
          { ingredientId, orderedQuantity: "10", unitCost: "", notes: "" },
          { ingredientId, orderedQuantity: "5", unitCost: "", notes: "" },
        ],
      }).success,
    ).toBe(false);
    expect(
      purchaseOrderReceiptSchema.safeParse({
        idempotencyKey,
        lines: [
          { purchaseOrderItemId, quantity: "2" },
          { purchaseOrderItemId, quantity: "1" },
        ],
      }).success,
    ).toBe(false);
  });

  test("validates explicit purchase-order transitions", () => {
    expect(purchaseOrderStatusSchema.safeParse({ action: "ORDER" }).success).toBe(
      true,
    );
    expect(purchaseOrderStatusSchema.safeParse({ action: "CANCEL" }).success).toBe(
      true,
    );
    expect(purchaseOrderStatusSchema.safeParse({ action: "RECEIVE" }).success).toBe(
      false,
    );
  });

  test("enforces tenant ownership and receipt ledger links in storage", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0078_inventory_procurement.sql",
      "utf8",
    );

    expect(schemaSource).toContain("inventorySuppliers");
    expect(schemaSource).toContain("inventoryPurchaseOrders");
    expect(schemaSource).toContain("inventoryPurchaseOrderReceiptItems");
    expect(migrationSource).toContain(
      'CONSTRAINT "inventory_po_items_order_org_fk"',
    );
    expect(migrationSource).toContain(
      'CONSTRAINT "inventory_po_receipt_items_movement_org_fk"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "inventory_po_receipts_org_idempotency_unique"',
    );
    expect(migrationSource).toContain('"received_quantity" <= "ordered_quantity"');
  });

  test("uses atomic numbering, line locks and immutable receipt movements", () => {
    const serviceSource = readFileSync("lib/inventory-procurement.ts", "utf8");

    expect(serviceSource).toContain("getNextPurchaseOrderNumber");
    expect(serviceSource).toContain("onConflictDoUpdate");
    expect(serviceSource).toContain('.for("update")');
    expect(serviceSource).toContain('movementType: "RECEIPT"');
    expect(serviceSource).toContain('referenceType: "PURCHASE_ORDER_RECEIPT"');
    expect(serviceSource).toContain(
      "Received quantity cannot exceed the outstanding order quantity.",
    );
  });

  test("protects every procurement route with inventory access", () => {
    const routePaths = [
      "app/api/inventory/procurement/route.ts",
      "app/api/inventory/suppliers/route.ts",
      "app/api/inventory/purchase-orders/route.ts",
      "app/api/inventory/purchase-orders/[id]/route.ts",
      "app/api/inventory/purchase-orders/[id]/status/route.ts",
      "app/api/inventory/purchase-orders/[id]/receipts/route.ts",
    ];

    for (const routePath of routePaths) {
      const source = readFileSync(routePath, "utf8");
      expect(source).toContain('requireStaffPermission("inventory.manage")');
      expect(source).toContain('"operations.inventory"');
    }
  });
});
