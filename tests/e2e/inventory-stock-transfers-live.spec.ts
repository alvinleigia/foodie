import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type { InventoryStockTransferConfiguration } from "@/types/inventory-stock-transfer";

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
const sourceRestaurantSlug =
  process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const sourceUsername = `transfer-source-uat-${suffix}`;
const destinationUsername = `transfer-destination-uat-${suffix}`;
const sourcePassword = `Uat-${randomUUID()}!`;
const destinationPassword = `Uat-${randomUUID()}!`;
const ingredientName = `UAT Transfer Ingredient ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT stock transfers", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let sourceOrganizationId = "";
  let destinationOrganizationId = "";
  let destinationRestaurantSlug = "";
  let sourceUserId = "";
  let destinationUserId = "";
  let sourceIngredientId = "";
  let destinationIngredientId = "";
  let transferId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [source] = await sql<{
      id: string;
      parentOrganizationId: string;
    }[]>`
      SELECT id, parent_organization_id AS "parentOrganizationId"
      FROM organizations
      WHERE slug = ${sourceRestaurantSlug}
        AND type = 'RESTAURANT'
        AND is_active = true
      LIMIT 1
    `;
    if (!source?.parentOrganizationId) {
      throw new Error(`UAT restaurant "${sourceRestaurantSlug}" was not found.`);
    }
    sourceOrganizationId = source.id;
    const [destination] = await sql<{ id: string; slug: string }[]>`
      SELECT id, slug
      FROM organizations
      WHERE parent_organization_id = ${source.parentOrganizationId}
        AND type = 'RESTAURANT'
        AND is_active = true
        AND id <> ${source.id}
      ORDER BY created_at
      LIMIT 1
    `;
    if (!destination) {
      throw new Error("A second active UAT restaurant is required for transfer testing.");
    }
    destinationOrganizationId = destination.id;
    destinationRestaurantSlug = destination.slug;

    for (const user of [
      {
        username: sourceUsername,
        password: sourcePassword,
        name: "Transfer Source Manager UAT",
        organizationId: sourceOrganizationId,
      },
      {
        username: destinationUsername,
        password: destinationPassword,
        name: "Transfer Destination Manager UAT",
        organizationId: destinationOrganizationId,
      },
    ]) {
      const passwordHash = await hashPassword(user.password);
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
        VALUES (
          ${user.username}, ${user.name}, ${`${user.username}@example.invalid`},
          ${passwordHash}, 'ADMIN', 'ACTIVE', now()
        )
        RETURNING id
      `;
      if (user.organizationId === sourceOrganizationId) {
        sourceUserId = created.id;
      } else {
        destinationUserId = created.id;
      }
      await sql`
        INSERT INTO memberships (
          user_id, organization_id, role, permission_overrides, is_active, updated_at
        ) VALUES (
          ${created.id}, ${user.organizationId}, 'RESTAURANT_MANAGER', '{}'::jsonb, true, now()
        )
      `;
    }

    const [sourceIngredient] = await sql<{ id: string }[]>`
      INSERT INTO inventory_ingredients (
        organization_id, name, unit, current_quantity, low_stock_threshold, is_active, updated_at
      ) VALUES (
        ${sourceOrganizationId}, ${ingredientName}, 'g', '1000.000', '100.000', true, now()
      )
      RETURNING id
    `;
    sourceIngredientId = sourceIngredient.id;
    const [destinationIngredient] = await sql<{ id: string }[]>`
      INSERT INTO inventory_ingredients (
        organization_id, name, unit, current_quantity, low_stock_threshold, is_active, updated_at
      ) VALUES (
        ${destinationOrganizationId}, ${ingredientName}, 'g', '100.000', '25.000', true, now()
      )
      RETURNING id
    `;
    destinationIngredientId = destinationIngredient.id;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (sourceUserId || destinationUserId) {
      await sql`
        DELETE FROM audit_logs
        WHERE actor_user_id IN (${sourceUserId || null}, ${destinationUserId || null})
      `;
    }
    if (transferId) {
      await sql`DELETE FROM inventory_stock_transfers WHERE id = ${transferId}`;
    }
    if (sourceIngredientId || destinationIngredientId) {
      await sql`
        DELETE FROM inventory_ingredient_movements
        WHERE ingredient_id IN (${sourceIngredientId || null}, ${destinationIngredientId || null})
      `;
      await sql`
        DELETE FROM inventory_ingredients
        WHERE id IN (${sourceIngredientId || null}, ${destinationIngredientId || null})
      `;
    }
    if (sourceUserId || destinationUserId) {
      await sql`
        DELETE FROM users
        WHERE id IN (${sourceUserId || null}, ${destinationUserId || null})
      `;
    }
    await sql.end();
  });

  test("dispatches once and receives actual stock with visible variance", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(sourceUsername);
    await page.getByLabel("Password").fill(sourcePassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(
      new RegExp(`/restaurants/${sourceRestaurantSlug}`),
    );
    await page.goto(`/restaurants/${sourceRestaurantSlug}/inventory`);
    await uatExpect(
      page.getByRole("heading", { name: "Stock transfers" }),
    ).toBeVisible();

    const createResponse = await page.request.post(
      "/api/inventory/stock-transfers",
      {
        data: {
          destinationOrganizationId,
          notes: "UAT inter-restaurant transfer",
          lines: [
            {
              sourceIngredientId,
              destinationIngredientId,
              quantity: "500",
            },
          ],
        },
      },
    );
    uatExpect(createResponse.status()).toBe(201);
    const created =
      (await createResponse.json()) as InventoryStockTransferConfiguration;
    const transfer = created.transfers.find(
      (item) => item.lines[0]?.sourceIngredientId === sourceIngredientId,
    )!;
    transferId = transfer.id;

    const dispatchResponse = await page.request.post(
      `/api/inventory/stock-transfers/${transferId}/status`,
      { data: { action: "SEND" } },
    );
    uatExpect(dispatchResponse.status()).toBe(200);
    const repeatedDispatch = await page.request.post(
      `/api/inventory/stock-transfers/${transferId}/status`,
      { data: { action: "SEND" } },
    );
    uatExpect(repeatedDispatch.status()).toBe(409);

    const [afterDispatch] = await sql<{
      currentQuantity: string;
      movementCount: number;
    }[]>`
      SELECT
        current_quantity AS "currentQuantity",
        (
          SELECT count(*)::int FROM inventory_ingredient_movements
          WHERE ingredient_id = ${sourceIngredientId}
            AND movement_type = 'TRANSFER_OUT'
            AND reference_id = ${transferId}
        ) AS "movementCount"
      FROM inventory_ingredients
      WHERE id = ${sourceIngredientId}
    `;
    uatExpect(afterDispatch.currentQuantity).toBe("500.000");
    uatExpect(afterDispatch.movementCount).toBe(1);

    await page.context().clearCookies();
    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(destinationUsername);
    await page.getByLabel("Password").fill(destinationPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(
      new RegExp(`/restaurants/${destinationRestaurantSlug}`),
    );
    await page.goto(`/restaurants/${destinationRestaurantSlug}/inventory`);
    await page.getByRole("tab", { name: /Inbound/ }).click();
    await uatExpect(page.getByText(transfer.reference, { exact: true })).toBeVisible();

    const receiptResponse = await page.request.post(
      `/api/inventory/stock-transfers/${transferId}/receive`,
      {
        data: {
          lines: [
            {
              transferItemId: transfer.lines[0].id,
              receivedQuantity: "450",
            },
          ],
        },
      },
    );
    uatExpect(receiptResponse.status()).toBe(201);
    const received =
      (await receiptResponse.json()) as InventoryStockTransferConfiguration;
    const completed = received.transfers.find((item) => item.id === transferId)!;
    uatExpect(completed.status).toBe("RECEIVED");
    uatExpect(completed.lines[0].receivedQuantity).toBe("450.000");
    uatExpect(completed.lines[0].varianceQuantity).toBe("50.000");

    const repeatedReceipt = await page.request.post(
      `/api/inventory/stock-transfers/${transferId}/receive`,
      {
        data: {
          lines: [
            {
              transferItemId: transfer.lines[0].id,
              receivedQuantity: "450",
            },
          ],
        },
      },
    );
    uatExpect(repeatedReceipt.status()).toBe(409);

    const [finalStock] = await sql<{
      currentQuantity: string;
      movementCount: number;
    }[]>`
      SELECT
        current_quantity AS "currentQuantity",
        (
          SELECT count(*)::int FROM inventory_ingredient_movements
          WHERE ingredient_id = ${destinationIngredientId}
            AND movement_type = 'TRANSFER_IN'
            AND reference_id = ${transferId}
        ) AS "movementCount"
      FROM inventory_ingredients
      WHERE id = ${destinationIngredientId}
    `;
    uatExpect(finalStock.currentQuantity).toBe("550.000");
    uatExpect(finalStock.movementCount).toBe(1);
  });
});
