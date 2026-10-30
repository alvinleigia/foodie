import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type {
  MenuAllergenDefinitionRecord,
  MenuCategoryRecord,
  MenuTagRecord,
} from "@/types/menu";

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

type AdminMenuResponse = {
  allergens: MenuAllergenDefinitionRecord[];
  categories: MenuCategoryRecord[];
  tags: MenuTagRecord[];
};

type PublicMenuResponse = {
  categories: MenuCategoryRecord[];
};

const environment = readLocalEnvironment();
const isUat = (environment.DEPLOYMENT_CELL_ID ?? "").toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const username = `menu-allergen-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const categoryName = `UAT Allergen Category ${suffix}`;
const itemName = `UAT Allergen Product ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT menu allergens", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";
  let categoryId = "";
  let itemId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [organization] = await sql<{ id: string }[]>`
      SELECT id
      FROM organizations
      WHERE slug = ${restaurantSlug}
        AND type = 'RESTAURANT'
        AND is_active = true
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
        ${username}, 'Menu Allergen Manager UAT',
        ${`${username}@example.invalid`}, ${passwordHash}, 'ADMIN', 'ACTIVE', now()
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
      INSERT INTO menu_categories (
        organization_id, slug, name, description, sort_order, is_active, updated_at
      ) VALUES (
        ${organizationId}, ${`uat-allergen-${suffix}`}, ${categoryName},
        'Temporary UAT allergen category', 9999, true, now()
      )
      RETURNING id
    `;
    categoryId = category.id;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
    }
    if (itemId) {
      await sql`DELETE FROM menu_items WHERE id = ${itemId}`;
    }
    if (categoryId) {
      await sql`DELETE FROM menu_categories WHERE id = ${categoryId}`;
    }
    if (userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    await sql.end();
  });

  test("persists and displays dietary labels and allergen declarations", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    const configurationResponse = await page.request.get("/api/menu/admin");
    uatExpect(configurationResponse.status()).toBe(200);
    const configuration =
      (await configurationResponse.json()) as AdminMenuResponse;
    uatExpect(configuration.allergens).toHaveLength(14);
    uatExpect(
      configuration.tags.some((tag) =>
        ["egg", "contains-dairy", "contains-nuts"].includes(tag.slug),
      ),
    ).toBe(false);

    const milk = configuration.allergens.find(
      (allergen) => allergen.code === "MILK",
    );
    const treeNuts = configuration.allergens.find(
      (allergen) => allergen.code === "TREE_NUTS",
    );
    const vegan = configuration.tags.find((tag) => tag.slug === "vegan");
    uatExpect(milk?.id).toBeTruthy();
    uatExpect(treeNuts?.id).toBeTruthy();
    uatExpect(vegan?.id).toBeTruthy();

    const itemPayload = {
      categoryId,
      prepStationId: "",
      name: itemName,
      description: "Temporary UAT allergen product",
      price: "1.00",
      imageUrl: "",
      sortOrder: 9999,
      isActive: true,
      isSoldOut: false,
      tagIds: [vegan!.id],
      allergens: [
        { allergenId: milk!.id, declaration: "CONTAINS" },
        { allergenId: treeNuts!.id, declaration: "MAY_CONTAIN" },
      ],
      modifierGroupIds: [],
      taxAssignmentMode: "DEFAULT",
      taxDefinitionIds: [],
      fulfilmentTaxOverrides: [],
    };
    const createResponse = await page.request.post("/api/menu/items", {
      data: itemPayload,
    });
    uatExpect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as {
      categories: MenuCategoryRecord[];
    };
    const createdItem = created.categories
      .flatMap((category) => category.items)
      .find((item) => item.name === itemName);
    uatExpect(createdItem?.id).toBeTruthy();
    itemId = createdItem!.id;
    uatExpect(createdItem?.tags?.map((tag) => tag.slug)).toContain("vegan");
    uatExpect(createdItem?.allergens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MILK", declaration: "CONTAINS" }),
        expect.objectContaining({
          code: "TREE_NUTS",
          declaration: "MAY_CONTAIN",
        }),
      ]),
    );

    const publicResponse = await page.request.get("/api/menu");
    uatExpect(publicResponse.status()).toBe(200);
    const publicMenu = (await publicResponse.json()) as PublicMenuResponse;
    const publicItem = publicMenu.categories
      .flatMap((category) => category.items)
      .find((item) => item.id === itemId);
    uatExpect(publicItem?.allergens).toEqual(createdItem?.allergens);

    await page.goto(`/restaurants/${restaurantSlug}/menu`);
    await uatExpect(page.getByText(itemName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Edit ${itemName}` }).click();
    const itemDialog = page.getByRole("dialog");
    await uatExpect(itemDialog.getByLabel("Milk declaration")).toHaveValue(
      "CONTAINS",
    );
    await uatExpect(
      itemDialog.getByLabel("Tree nuts declaration"),
    ).toHaveValue("MAY_CONTAIN");
    await itemDialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/restaurants/${restaurantSlug}/order`);
    await uatExpect(page.getByText(itemName, { exact: true })).toBeVisible();
    await uatExpect(page.getByText(/Contains:\s*Milk/)).toBeVisible();
    await uatExpect(page.getByText(/May contain:\s*Tree nuts/)).toBeVisible();

    const duplicateResponse = await page.request.patch(
      `/api/menu/items/${itemId}`,
      {
        data: {
          ...itemPayload,
          allergens: [
            { allergenId: milk!.id, declaration: "CONTAINS" },
            { allergenId: milk!.id, declaration: "MAY_CONTAIN" },
          ],
        },
      },
    );
    uatExpect(duplicateResponse.status()).toBe(400);

    const updateResponse = await page.request.patch(
      `/api/menu/items/${itemId}`,
      {
        data: {
          ...itemPayload,
          allergens: [
            { allergenId: milk!.id, declaration: "MAY_CONTAIN" },
          ],
        },
      },
    );
    uatExpect(updateResponse.status()).toBe(200);
    const updated = (await updateResponse.json()) as {
      categories: MenuCategoryRecord[];
    };
    const updatedItem = updated.categories
      .flatMap((category) => category.items)
      .find((item) => item.id === itemId);
    uatExpect(updatedItem?.allergens).toEqual([
      expect.objectContaining({ code: "MILK", declaration: "MAY_CONTAIN" }),
    ]);
  });
});
