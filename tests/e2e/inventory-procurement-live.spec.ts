import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type { InventoryProcurementConfiguration } from "@/types/inventory-procurement";

function readLocalEnvironment() {
  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return values;
      }
      const separator = trimmed.indexOf("=");
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[trimmed.slice(0, separator).trim()] = value;
      return values;
    }, {});
}

const environment = readLocalEnvironment();
const isUat = (environment.DEPLOYMENT_CELL_ID ?? "").toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const username = `procurement-manager-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const supplierName = `UAT Supplier ${suffix}`;
const ingredientName = `UAT Procurement Ingredient ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT inventory procurement", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";
  let ingredientId = "";
  let supplierId = "";
  let purchaseOrderId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [organization] = await sql<{ id: string }[]>`
      SELECT id FROM organizations
      WHERE slug = ${restaurantSlug} AND type = 'RESTAURANT' AND is_active = true
      LIMIT 1
    `;
    if (!organization) {
      throw new Error(`UAT restaurant "${restaurantSlug}" was not found.`);
    }
    organizationId = organization.id;

    const passwordHash = await hashPassword(password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
      VALUES (
        ${username}, 'Procurement Manager UAT', ${`${username}@example.invalid`},
        ${passwordHash}, 'ADMIN', 'ACTIVE', now()
      )
      RETURNING id
    `;
    userId = user.id;
    await sql`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      ) VALUES (
        ${userId}, ${organizationId}, 'RESTAURANT_MANAGER', '{}'::jsonb, true, now()
      )
    `;
    const [ingredient] = await sql<{ id: string }[]>`
      INSERT INTO inventory_ingredients (
        organization_id, name, unit, current_quantity, low_stock_threshold, is_active, updated_at
      ) VALUES (
        ${organizationId}, ${ingredientName}, 'g', '1000.000', '100.000', true, now()
      )
      RETURNING id
    `;
    ingredientId = ingredient.id;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
    }
    await sql`
      DELETE FROM inventory_purchase_order_receipt_items
      WHERE organization_id = ${organizationId}
        AND receipt_id IN (
          SELECT id FROM inventory_purchase_order_receipts
          WHERE organization_id = ${organizationId}
            AND purchase_order_id = ${purchaseOrderId || null}
        )
    `;
    await sql`
      DELETE FROM inventory_purchase_order_receipts
      WHERE organization_id = ${organizationId}
        AND purchase_order_id = ${purchaseOrderId || null}
    `;
    if (ingredientId) {
      await sql`
        DELETE FROM inventory_ingredient_movements
        WHERE organization_id = ${organizationId} AND ingredient_id = ${ingredientId}
      `;
    }
    if (purchaseOrderId) {
      await sql`
        DELETE FROM inventory_purchase_orders
        WHERE organization_id = ${organizationId} AND id = ${purchaseOrderId}
      `;
    }
    if (supplierId) {
      await sql`
        DELETE FROM inventory_suppliers
        WHERE organization_id = ${organizationId} AND id = ${supplierId}
      `;
    }
    if (ingredientId) {
      await sql`
        DELETE FROM inventory_ingredients
        WHERE organization_id = ${organizationId} AND id = ${ingredientId}
      `;
    }
    if (userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    await sql.end();
  });

  test("creates, places and partially receives a purchase order exactly once", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));
    await page.goto(`/restaurants/${restaurantSlug}/inventory`);
    await uatExpect(page.getByRole("heading", { name: "Procurement" })).toBeVisible();

    await page.getByRole("tab", { name: "Suppliers" }).click();
    await page.getByRole("button", { name: "Add supplier" }).click();
    const supplierDialog = page.getByRole("dialog");
    await supplierDialog.getByLabel("Supplier name").fill(supplierName);
    await supplierDialog.getByLabel("Email").fill("orders@example.invalid");
    await supplierDialog.getByRole("button", { name: "Save supplier" }).click();
    await uatExpect(page.getByText(supplierName, { exact: true })).toBeVisible();

    let configurationResponse = await page.request.get(
      "/api/inventory/procurement",
    );
    let configuration =
      (await configurationResponse.json()) as InventoryProcurementConfiguration;
    supplierId = configuration.suppliers.find(
      (supplier) => supplier.name === supplierName,
    )!.id;

    await page.getByRole("tab", { name: "Purchase orders" }).click();
    await page.getByRole("button", { name: "New purchase order" }).click();
    const orderDialog = page.getByRole("dialog");
    await orderDialog.getByLabel("Supplier").selectOption(supplierId);
    await orderDialog.getByLabel(`Include ${ingredientName}`).check();
    await orderDialog
      .getByLabel(`${ingredientName} ordered quantity`)
      .fill("500");
    await orderDialog.getByLabel(`${ingredientName} unit cost`).fill("0.02");
    await orderDialog.getByRole("button", { name: "Create draft" }).click();
    await uatExpect(page.getByText(/^PO-\d{6}$/).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit draft" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByLabel(`${ingredientName} ordered quantity`)
      .fill("600");
    const editResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/inventory/purchase-orders/") &&
        response.request().method() === "PUT",
    );
    await editDialog.getByRole("button", { name: "Save draft" }).click();
    uatExpect((await editResponse).status()).toBe(200);

    configurationResponse = await page.request.get("/api/inventory/procurement");
    configuration =
      (await configurationResponse.json()) as InventoryProcurementConfiguration;
    const purchaseOrder = configuration.purchaseOrders.find(
      (order) => order.supplierId === supplierId,
    )!;
    purchaseOrderId = purchaseOrder.id;
    const line = purchaseOrder.lines[0];
    uatExpect(line.orderedQuantity).toBe("600.000");

    const orderResponse = await page.request.post(
      `/api/inventory/purchase-orders/${purchaseOrderId}/status`,
      { data: { action: "ORDER" } },
    );
    uatExpect(orderResponse.status()).toBe(200);

    const firstReceiptKey = randomUUID();
    const firstReceipt = {
      idempotencyKey: firstReceiptKey,
      notes: "Partial delivery",
      lines: [{ purchaseOrderItemId: line.id, quantity: "200" }],
    };
    const firstReceiptResponse = await page.request.post(
      `/api/inventory/purchase-orders/${purchaseOrderId}/receipts`,
      { data: firstReceipt },
    );
    uatExpect(firstReceiptResponse.status()).toBe(201);
    const repeatedReceiptResponse = await page.request.post(
      `/api/inventory/purchase-orders/${purchaseOrderId}/receipts`,
      { data: firstReceipt },
    );
    uatExpect(repeatedReceiptResponse.status()).toBe(201);

    const [afterPartial] = await sql<{
      currentQuantity: string;
      receiptCount: number;
    }[]>`
      SELECT
        ingredient.current_quantity AS "currentQuantity",
        (
          SELECT count(*)::int FROM inventory_purchase_order_receipts
          WHERE purchase_order_id = ${purchaseOrderId}
        ) AS "receiptCount"
      FROM inventory_ingredients ingredient
      WHERE ingredient.id = ${ingredientId}
    `;
    uatExpect(afterPartial.currentQuantity).toBe("1200.000");
    uatExpect(afterPartial.receiptCount).toBe(1);

    const overReceiptResponse = await page.request.post(
      `/api/inventory/purchase-orders/${purchaseOrderId}/receipts`,
      {
        data: {
          idempotencyKey: randomUUID(),
          notes: "Invalid excess",
          lines: [{ purchaseOrderItemId: line.id, quantity: "401" }],
        },
      },
    );
    uatExpect(overReceiptResponse.status()).toBe(409);

    const finalReceiptResponse = await page.request.post(
      `/api/inventory/purchase-orders/${purchaseOrderId}/receipts`,
      {
        data: {
          idempotencyKey: randomUUID(),
          notes: "Final delivery",
          lines: [{ purchaseOrderItemId: line.id, quantity: "400" }],
        },
      },
    );
    uatExpect(finalReceiptResponse.status()).toBe(201);
    const finalConfiguration =
      (await finalReceiptResponse.json()) as InventoryProcurementConfiguration;
    const completedOrder = finalConfiguration.purchaseOrders.find(
      (order) => order.id === purchaseOrderId,
    )!;
    uatExpect(completedOrder.status).toBe("RECEIVED");
    uatExpect(completedOrder.lines[0].receivedQuantity).toBe("600.000");
    uatExpect(completedOrder.receipts).toHaveLength(2);

    const [finalStock] = await sql<{
      currentQuantity: string;
      movementCount: number;
      linkedReceiptLines: number;
    }[]>`
      SELECT
        ingredient.current_quantity AS "currentQuantity",
        (
          SELECT count(*)::int FROM inventory_ingredient_movements
          WHERE ingredient_id = ${ingredientId}
            AND reference_type = 'PURCHASE_ORDER_RECEIPT'
        ) AS "movementCount",
        (
          SELECT count(*)::int FROM inventory_purchase_order_receipt_items
          WHERE ingredient_id = ${ingredientId}
        ) AS "linkedReceiptLines"
      FROM inventory_ingredients ingredient
      WHERE ingredient.id = ${ingredientId}
    `;
    uatExpect(finalStock.currentQuantity).toBe("1600.000");
    uatExpect(finalStock.movementCount).toBe(2);
    uatExpect(finalStock.linkedReceiptLines).toBe(2);
  });
});
