import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";

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
const username = `depletion-manager-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT ingredient inventory depletion", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";
  let categoryId = "";
  let productId = "";
  let ingredientId = "";
  let orderId = "";

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
        ${username}, 'Depletion Manager UAT', ${`${username}@example.invalid`},
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

    const [category] = await sql<{ id: string }[]>`
      INSERT INTO menu_categories (organization_id, slug, name, is_active, updated_at)
      VALUES (${organizationId}, ${`uat-depletion-${suffix}`}, ${`UAT Depletion ${suffix}`}, true, now())
      RETURNING id
    `;
    categoryId = category.id;
    const [product] = await sql<{ id: string }[]>`
      INSERT INTO menu_items (
        organization_id, category_id, slug, name, price, is_active, is_sold_out, updated_at
      ) VALUES (
        ${organizationId}, ${categoryId}, ${`uat-depletion-product-${suffix}`},
        ${`UAT Depletion Product ${suffix}`}, '5.00', true, false, now()
      )
      RETURNING id
    `;
    productId = product.id;
    const [ingredient] = await sql<{ id: string }[]>`
      INSERT INTO inventory_ingredients (
        organization_id, name, unit, current_quantity, low_stock_threshold, is_active, updated_at
      ) VALUES (
        ${organizationId}, ${`UAT Depletion Ingredient ${suffix}`}, 'g',
        '1000.000', '100.000', true, now()
      )
      RETURNING id
    `;
    ingredientId = ingredient.id;
    await sql`
      INSERT INTO menu_item_ingredients (
        organization_id, menu_item_id, ingredient_id, quantity, updated_at
      ) VALUES (${organizationId}, ${productId}, ${ingredientId}, '125.000', now())
    `;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (orderId) {
      await sql`DELETE FROM orders WHERE id = ${orderId} AND organization_id = ${organizationId}`;
    }
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
    }
    if (categoryId) {
      await sql`DELETE FROM menu_categories WHERE id = ${categoryId} AND organization_id = ${organizationId}`;
    }
    if (ingredientId) {
      await sql`
        DELETE FROM inventory_ingredient_movements
        WHERE ingredient_id = ${ingredientId} AND organization_id = ${organizationId}
      `;
      await sql`
        DELETE FROM inventory_ingredients
        WHERE id = ${ingredientId} AND organization_id = ${organizationId}
      `;
    }
    if (userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    await sql.end();
  });

  test("depletes, snapshots and restores the original recipe quantity", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    const createResponse = await page.request.post("/api/orders", {
      data: {
        customerName: `UAT depletion ${suffix}`,
        fulfilmentType: "DINE_IN",
        items: [
          {
            categoryId,
            drinkId: productId,
            modifiers: [],
            notes: "Ingredient depletion UAT",
            quantity: 2,
          },
        ],
        scheduledFulfilmentAt: null,
      },
    });
    uatExpect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as { orderId: string };
    orderId = created.orderId;

    const [afterOrder] = await sql<{ currentQuantity: string }[]>`
      SELECT current_quantity AS "currentQuantity"
      FROM inventory_ingredients WHERE id = ${ingredientId}
    `;
    uatExpect(afterOrder.currentQuantity).toBe("750.000");
    const [reservation] = await sql<{
      quantity: string;
      restoredAt: Date | null;
    }[]>`
      SELECT
        quantity,
        restored_at AS "restoredAt"
      FROM order_item_ingredient_reservations
      WHERE order_id = ${orderId} AND ingredient_id = ${ingredientId}
    `;
    uatExpect(reservation.quantity).toBe("250.000");
    uatExpect(reservation.restoredAt).toBeNull();
    const [saleMovement] = await sql<{
      quantityDelta: string;
      referenceId: string;
    }[]>`
      SELECT
        quantity_delta AS "quantityDelta",
        reference_id AS "referenceId"
      FROM inventory_ingredient_movements
      WHERE ingredient_id = ${ingredientId} AND movement_type = 'SALE'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    uatExpect(saleMovement.quantityDelta).toBe("-250.000");
    uatExpect(saleMovement.referenceId).toBeTruthy();

    await sql`
      UPDATE menu_item_ingredients
      SET quantity = '200.000', updated_at = now()
      WHERE menu_item_id = ${productId} AND ingredient_id = ${ingredientId}
    `;

    const cancelResponse = await page.request.post(`/api/orders/${orderId}/cancel`, {
      data: {
        applyCustomerCancellationFee: false,
        cancelReason: "Ingredient depletion UAT cleanup",
        retryRefund: false,
      },
    });
    if (cancelResponse.status() !== 200) {
      throw new Error(
        `Cancellation failed: ${cancelResponse.status()} ${await cancelResponse.text()}`,
      );
    }

    const [afterCancellation] = await sql<{
      currentQuantity: string;
      restoredAt: Date | null;
      reservedAt: Date | null;
    }[]>`
      SELECT
        ingredient.current_quantity AS "currentQuantity",
        reservation.restored_at AS "restoredAt",
        item.ingredient_inventory_reserved_at AS "reservedAt"
      FROM order_item_ingredient_reservations reservation
      JOIN inventory_ingredients ingredient ON ingredient.id = reservation.ingredient_id
      JOIN order_items item ON item.id = reservation.order_item_id
      WHERE reservation.order_id = ${orderId}
        AND reservation.ingredient_id = ${ingredientId}
    `;
    uatExpect(afterCancellation.currentQuantity).toBe("1000.000");
    uatExpect(afterCancellation.restoredAt).not.toBeNull();
    uatExpect(afterCancellation.reservedAt).toBeNull();
    const [restoreMovement] = await sql<{ quantityDelta: string }[]>`
      SELECT quantity_delta AS "quantityDelta"
      FROM inventory_ingredient_movements
      WHERE ingredient_id = ${ingredientId} AND movement_type = 'RESTORE'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    uatExpect(restoreMovement.quantityDelta).toBe("250.000");

    await sql`
      UPDATE inventory_ingredients
      SET current_quantity = '100.000', updated_at = now()
      WHERE id = ${ingredientId}
    `;
    const insufficientResponse = await page.request.post("/api/orders", {
      data: {
        customerName: `UAT insufficient ${suffix}`,
        fulfilmentType: "DINE_IN",
        items: [
          {
            categoryId,
            drinkId: productId,
            modifiers: [],
            notes: "Insufficient ingredient safeguard",
            quantity: 1,
          },
        ],
        scheduledFulfilmentAt: null,
      },
    });
    uatExpect(insufficientResponse.status()).toBe(409);
    uatExpect(await insufficientResponse.text()).toContain(
      "Only 100 g",
    );
    const [afterRejectedOrder] = await sql<{ currentQuantity: string }[]>`
      SELECT current_quantity AS "currentQuantity"
      FROM inventory_ingredients WHERE id = ${ingredientId}
    `;
    uatExpect(afterRejectedOrder.currentQuantity).toBe("100.000");
  });
});
