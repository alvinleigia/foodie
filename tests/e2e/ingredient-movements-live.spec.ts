import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type { IngredientInventoryConfiguration } from "@/types/ingredient-inventory";

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
const username = `movement-manager-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const ingredientName = `UAT Movement Ingredient ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT ingredient stock movements", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";
  let ingredientId = "";

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
        ${username}, 'Movement Manager UAT', ${`${username}@example.invalid`},
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

  test("records receipts, waste and stocktake variance atomically", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    await page.goto(`/restaurants/${restaurantSlug}/inventory`);
    await uatExpect(
      page.getByRole("heading", { name: "Stock movements" }),
    ).toBeVisible();
    await page.getByLabel("Ingredient", { exact: true }).selectOption(ingredientId);
    await page.getByLabel("Movement", { exact: true }).selectOption("RECEIPT");
    await page.getByLabel("Quantity", { exact: true }).fill("500");
    await page.getByLabel("Reason", { exact: true }).fill("Supplier delivery");
    const receiptResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/inventory/movements") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record" }).click();
    uatExpect((await receiptResponse).status()).toBe(201);
    await uatExpect(page.getByText("Supplier delivery", { exact: true })).toBeVisible();

    for (const movement of [
      { action: "WASTE", quantity: "100", reason: "Damaged during prep" },
      { action: "STOCKTAKE", quantity: "1350", reason: "End of day count" },
    ]) {
      const response = await page.request.post("/api/inventory/movements", {
        data: { ingredientId, ...movement },
      });
      uatExpect(response.status()).toBe(201);
    }

    const rejected = await page.request.post("/api/inventory/movements", {
      data: {
        ingredientId,
        action: "WASTE",
        quantity: "2000",
        reason: "Impossible waste entry",
      },
    });
    uatExpect(rejected.status()).toBe(409);

    const response = await page.request.get("/api/inventory/ingredients");
    uatExpect(response.status()).toBe(200);
    const configuration =
      (await response.json()) as IngredientInventoryConfiguration;
    const ingredient = configuration.ingredients.find(
      (item) => item.id === ingredientId,
    );
    uatExpect(ingredient?.currentQuantity).toBe("1350.000");
    uatExpect(
      configuration.movements
        .filter((movement) => movement.ingredientId === ingredientId)
        .map((movement) => ({
          type: movement.movementType,
          delta: movement.quantityDelta,
          actor: movement.recordedByName,
        })),
    ).toEqual([
      { type: "STOCKTAKE", delta: "-50.000", actor: "Movement Manager UAT" },
      { type: "WASTE", delta: "-100.000", actor: "Movement Manager UAT" },
      { type: "RECEIPT", delta: "500.000", actor: "Movement Manager UAT" },
    ]);
  });
});
