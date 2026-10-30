import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type { MenuAvailabilityConfiguration } from "@/types/menu-availability";

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

type MenuResponse = {
  categories: Array<{
    id: string;
    items: Array<{ id: string }>;
  }>;
};

const environment = readLocalEnvironment();
const isUat = (environment.DEPLOYMENT_CELL_ID ?? "").toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const username = `menu-availability-uat-${suffix}`;
const password = `Uat-${randomUUID()}!`;
const categoryName = `UAT Timed Category ${suffix}`;
const itemName = `UAT Timed Product ${suffix}`;
const categoryScheduleName = `UAT Category Hours ${suffix}`;
const itemScheduleName = `UAT Product Hours ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });
const allWeek = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  opensAtMinute: 0,
  closesAtMinute: 0,
  is24Hours: true,
}));

function hasCategory(menu: MenuResponse, categoryId: string) {
  return menu.categories.some((category) => category.id === categoryId);
}

function hasItem(menu: MenuResponse, itemId: string) {
  return menu.categories.some((category) =>
    category.items.some((item) => item.id === itemId),
  );
}

test.describe("live UAT menu availability", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let userId = "";
  let categoryId = "";
  let itemId = "";
  const scheduleIds: string[] = [];

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
        ${username}, 'Menu Availability Manager UAT',
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
        ${organizationId}, ${`uat-timed-${suffix}`}, ${categoryName},
        'Temporary UAT availability category', 9999, true, now()
      )
      RETURNING id
    `;
    categoryId = category.id;
    const [item] = await sql<{ id: string }[]>`
      INSERT INTO menu_items (
        organization_id, category_id, slug, name, description, price,
        sort_order, is_active, is_sold_out, updated_at
      ) VALUES (
        ${organizationId}, ${categoryId}, ${`uat-timed-product-${suffix}`},
        ${itemName}, 'Temporary UAT availability product', '1.00',
        9999, true, false, now()
      )
      RETURNING id
    `;
    itemId = item.id;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
    }
    if (scheduleIds.length) {
      await sql`
        DELETE FROM menu_availability_schedules
        WHERE id IN ${sql(scheduleIds)}
          AND organization_id = ${organizationId}
      `;
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

  test("enforces category and product schedules without hiding admin records", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    await page.goto(`/restaurants/${restaurantSlug}/menu`);
    await uatExpect(
      page.getByRole("heading", { name: "Menu availability" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add schedule" }).click();
    const scheduleDialog = page.getByRole("dialog");
    await scheduleDialog.getByLabel("Schedule name").fill(categoryScheduleName);
    await scheduleDialog
      .locator("label")
      .filter({ hasText: categoryName })
      .getByRole("checkbox")
      .check();
    const categorySave = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/menu/availability") &&
        response.request().method() === "POST",
    );
    await scheduleDialog.getByRole("button", { name: "Save schedule" }).click();
    uatExpect((await categorySave).status()).toBe(201);
    await uatExpect(page.getByText(categoryScheduleName, { exact: true })).toBeVisible();

    const categoryConfigurationResponse = await page.request.get(
      "/api/menu/availability",
    );
    uatExpect(categoryConfigurationResponse.status()).toBe(200);
    let configuration =
      (await categoryConfigurationResponse.json()) as MenuAvailabilityConfiguration;
    const categorySchedule = configuration.schedules.find(
      (schedule) => schedule.name === categoryScheduleName,
    );
    uatExpect(categorySchedule?.id).toBeTruthy();
    scheduleIds.push(categorySchedule!.id);

    let publicResponse = await page.request.get("/api/menu");
    uatExpect(publicResponse.status()).toBe(200);
    let publicMenu = (await publicResponse.json()) as MenuResponse;
    uatExpect(hasCategory(publicMenu, categoryId)).toBe(false);

    const adminResponse = await page.request.get("/api/menu/admin");
    uatExpect(adminResponse.status()).toBe(200);
    const adminMenu = (await adminResponse.json()) as MenuResponse;
    uatExpect(hasCategory(adminMenu, categoryId)).toBe(true);
    uatExpect(hasItem(adminMenu, itemId)).toBe(true);

    const openCategoryResponse = await page.request.put(
      `/api/menu/availability/${categorySchedule!.id}`,
      {
        data: {
          name: categoryScheduleName,
          isEnabled: true,
          periods: allWeek,
          categoryIds: [categoryId],
          itemIds: [],
        },
      },
    );
    uatExpect(openCategoryResponse.status()).toBe(200);
    publicResponse = await page.request.get("/api/menu");
    publicMenu = (await publicResponse.json()) as MenuResponse;
    uatExpect(hasCategory(publicMenu, categoryId)).toBe(true);
    uatExpect(hasItem(publicMenu, itemId)).toBe(true);

    const itemScheduleResponse = await page.request.post(
      "/api/menu/availability",
      {
        data: {
          name: itemScheduleName,
          isEnabled: true,
          periods: [],
          categoryIds: [],
          itemIds: [itemId],
        },
      },
    );
    uatExpect(itemScheduleResponse.status()).toBe(201);
    configuration =
      (await itemScheduleResponse.json()) as MenuAvailabilityConfiguration;
    const itemSchedule = configuration.schedules.find(
      (schedule) => schedule.name === itemScheduleName,
    );
    uatExpect(itemSchedule?.id).toBeTruthy();
    scheduleIds.push(itemSchedule!.id);

    publicResponse = await page.request.get("/api/menu");
    publicMenu = (await publicResponse.json()) as MenuResponse;
    uatExpect(hasItem(publicMenu, itemId)).toBe(false);

    const openItemResponse = await page.request.put(
      `/api/menu/availability/${itemSchedule!.id}`,
      {
        data: {
          name: itemScheduleName,
          isEnabled: true,
          periods: allWeek,
          categoryIds: [],
          itemIds: [itemId],
        },
      },
    );
    uatExpect(openItemResponse.status()).toBe(200);
    publicResponse = await page.request.get("/api/menu");
    publicMenu = (await publicResponse.json()) as MenuResponse;
    uatExpect(hasItem(publicMenu, itemId)).toBe(true);

    const pauseItemResponse = await page.request.put(
      `/api/menu/availability/${itemSchedule!.id}`,
      {
        data: {
          name: itemScheduleName,
          isEnabled: false,
          periods: allWeek,
          categoryIds: [],
          itemIds: [itemId],
        },
      },
    );
    uatExpect(pauseItemResponse.status()).toBe(200);
    publicResponse = await page.request.get("/api/menu");
    publicMenu = (await publicResponse.json()) as MenuResponse;
    uatExpect(hasItem(publicMenu, itemId)).toBe(false);
  });
});
