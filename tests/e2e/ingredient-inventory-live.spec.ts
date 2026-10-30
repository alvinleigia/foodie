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
const username = `ingredient-manager-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const ingredientName = `UAT Ingredient ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT ingredient and recipe inventory", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";

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
        ${username}, 'Ingredient Manager UAT', ${`${username}@example.invalid`},
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
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
    }
    if (organizationId) {
      await sql`
        DELETE FROM menu_item_ingredients
        WHERE organization_id = ${organizationId}
          AND ingredient_id IN (
            SELECT id FROM inventory_ingredients
            WHERE organization_id = ${organizationId} AND name = ${ingredientName}
          )
      `;
      await sql`
        DELETE FROM inventory_ingredient_movements
        WHERE organization_id = ${organizationId}
          AND ingredient_id IN (
            SELECT id FROM inventory_ingredients
            WHERE organization_id = ${organizationId} AND name = ${ingredientName}
          )
      `;
      await sql`
        DELETE FROM inventory_ingredients
        WHERE organization_id = ${organizationId} AND name = ${ingredientName}
      `;
    }
    if (userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    await sql.end();
  });

  test("creates an ingredient and persists a product recipe", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    await page.goto(`/restaurants/${restaurantSlug}/inventory`);
    await uatExpect(
      page.getByRole("heading", { name: "Ingredients" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add ingredient" }).first().click();
    const ingredientDialog = page.getByRole("dialog");
    await ingredientDialog.getByLabel("Ingredient name").fill(ingredientName);
    await ingredientDialog.getByLabel("Base unit").fill("g");
    await ingredientDialog.getByLabel("Opening quantity").fill("5000");
    await ingredientDialog.getByLabel("Low-stock threshold").fill("500");
    await ingredientDialog.getByRole("button", { name: "Save ingredient" }).click();
    await uatExpect(page.getByText(ingredientName, { exact: true }).first()).toBeVisible();

    const configurationResponse = await page.request.get(
      "/api/inventory/ingredients",
    );
    uatExpect(configurationResponse.status()).toBe(200);
    const initialConfiguration =
      (await configurationResponse.json()) as IngredientInventoryConfiguration;
    const ingredient = initialConfiguration.ingredients.find(
      (item) => item.name === ingredientName,
    );
    const product = initialConfiguration.products[0];
    uatExpect(ingredient?.id).toBeTruthy();
    uatExpect(product?.id).toBeTruthy();
    uatExpect(initialConfiguration.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: ingredient?.id,
          movementType: "OPENING",
          quantityDelta: "5000.000",
        }),
      ]),
    );

    const ingredientToggle = page
      .locator("label")
      .filter({ hasText: ingredientName })
      .getByRole("checkbox");
    await ingredientToggle.check();
    await page.getByLabel(`${ingredientName} quantity`).fill("125");
    const recipeSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/inventory/recipes") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save recipe" }).click();
    uatExpect((await recipeSaveResponse).status()).toBe(200);

    const persistedResponse = await page.request.get(
      "/api/inventory/ingredients",
    );
    uatExpect(persistedResponse.status()).toBe(200);
    const persisted =
      (await persistedResponse.json()) as IngredientInventoryConfiguration;
    const persistedProduct = persisted.products.find(
      (item) => item.id === product.id,
    );
    uatExpect(persistedProduct?.recipe).toContainEqual({
      ingredientId: ingredient?.id,
      quantity: "125.000",
    });
  });
});
