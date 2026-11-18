import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { getDb } from "@/db";
import {
  auditLogs, memberships, menuAvailabilitySchedules, menuCategories,
  menuCategoryAvailabilitySchedules, menuItems, orderItems, orders,
  organizations, organizationSubscriptions, prepStations, saasPlans, users,
} from "@/db/schema";
import { hashPassword } from "@/lib/passwords";

const databaseUrl = process.env.E2E_CATEGORY_DELETION_DATABASE_URL;
const appUrl = process.env.E2E_CATEGORY_DELETION_APP_URL;
const password = "LocalCategoryDeletion123!";

test.describe("guarded menu category deletion", () => {
  test.skip(!databaseUrl || !appUrl, "Set isolated local E2E_CATEGORY_DELETION_DATABASE_URL and E2E_CATEGORY_DELETION_APP_URL.");
  test.beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/foodie_category_deletion" ||
      !["127.0.0.1", "localhost"].includes(new URL(appUrl!).hostname)) {
      throw new Error("Category deletion tests require the isolated local foodie_category_deletion database and local application.");
    }
    process.env.DATABASE_URL = databaseUrl;
  });

  async function fixture(manager = true) {
    const db = getDb();
    const suffix = randomUUID();
    const [company] = await db.insert(organizations).values({ name: "Company", slug: `company-${suffix}`, type: "COMPANY", timezone: "Europe/London", currency: "GBP" }).returning();
    const [plan] = await db.select().from(saasPlans).limit(1);
    await db.insert(organizationSubscriptions).values({ organizationId: company.id, planId: plan.id, status: "ACTIVE" });
    const [restaurant, otherRestaurant] = await db.insert(organizations).values([0, 1].map((index) => ({
      name: `Restaurant ${index}`, slug: `restaurant-${suffix}-${index}`, type: "RESTAURANT" as const,
      parentOrganizationId: company.id, timezone: "Europe/London", currency: "GBP",
    }))).returning();
    const [user] = await db.insert(users).values({ username: `manager-${suffix}`, name: "Manager", email: `${suffix}@example.com`, passwordHash: await hashPassword(password), role: "ADMIN" }).returning();
    await db.insert(memberships).values({ userId: user.id, organizationId: restaurant.id, role: manager ? "RESTAURANT_MANAGER" : "ORDER_OPERATOR" });
    const [station] = await db.insert(prepStations).values({ organizationId: restaurant.id, name: "Kitchen", slug: "kitchen", type: "KITCHEN" }).returning();
    const [empty, keep] = await db.insert(menuCategories).values(["Empty category", "Keep category"].map((name, index) => ({
      name, organizationId: restaurant.id, slug: `category-${index}`, sortOrder: index,
    }))).returning();
    const [outside] = await db.insert(menuCategories).values({ name: "Other restaurant", organizationId: otherRestaurant.id, slug: "outside" }).returning();
    return { db, restaurant, otherRestaurant, user, station, empty, keep, outside };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function signIn(request: APIRequestContext, f: Fixture) {
    const { csrfToken } = await (await request.get(`${appUrl}/api/auth/csrf`)).json();
    await request.post(`${appUrl}/api/auth/callback/credentials`, {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { username: f.user.username, password, csrfToken, callbackUrl: appUrl! },
    });
    expect((await (await request.get(`${appUrl}/api/auth/session`)).json()).user?.id).toBe(f.user.id);
  }
  function endpoint(id: string) { return `${appUrl}/api/menu/categories/${id}`; }
  function itemValues(f: Fixture, categoryId = f.empty.id) {
    return { organizationId: f.restaurant.id, categoryId, slug: `item-${randomUUID()}`, name: "Existing product", isActive: false };
  }

  test("requires menu permission and an authenticated session", async ({ request }) => {
    const f = await fixture(false);
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(401);
    await signIn(request, f);
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(401);
    expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.empty.id))).toHaveLength(1);
  });

  test("rejects invalid IDs and categories outside the active restaurant", async ({ request }) => {
    const f = await fixture();
    await signIn(request, f);
    expect((await request.delete(endpoint("invalid"))).status()).toBe(400);
    expect((await request.delete(endpoint(randomUUID()))).status()).toBe(404);
    expect((await request.delete(endpoint(f.outside.id))).status()).toBe(404);
    expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.outside.id))).toHaveLength(1);
  });

  test("deletes only an empty category, refreshes menu results and audits once", async ({ request }) => {
    const f = await fixture();
    await signIn(request, f);
    const response = await request.delete(endpoint(f.empty.id));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deletedCategoryId: f.empty.id });
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(404);
    expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.keep.id))).toHaveLength(1);
    const audit = await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.empty.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "menu.category.delete", actorUserId: f.user.id, metadata: { name: f.empty.name, slug: f.empty.slug } });
    const menu = await (await request.get(`${appUrl}/api/menu/admin`)).json();
    expect(menu.categories.map((category: { id: string }) => category.id)).toEqual([f.keep.id]);
  });

  for (const state of ["active", "hidden", "sold-out"] as const) {
    test(`does not cascade away ${state} products`, async ({ request }) => {
      const f = await fixture();
      const [item] = await f.db.insert(menuItems).values({
        ...itemValues(f), isActive: state !== "hidden", isSoldOut: state === "sold-out", prepStationId: f.station.id,
      }).returning();
      await signIn(request, f);
      const response = await request.delete(endpoint(f.empty.id));
      expect(response.status()).toBe(409);
      expect((await response.json()).error).toContain("Move all products");
      expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.empty.id))).toHaveLength(1);
      expect(await f.db.select().from(menuItems).where(eq(menuItems.id, item.id))).toHaveLength(1);
    });
  }

  test("allows deletion after products have been moved to another category", async ({ request }) => {
    const f = await fixture();
    const [item] = await f.db.insert(menuItems).values(itemValues(f)).returning();
    await signIn(request, f);
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(409);
    await f.db.update(menuItems).set({ categoryId: f.keep.id }).where(eq(menuItems.id, item.id));
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(200);
    const [kept] = await f.db.select().from(menuItems).where(eq(menuItems.id, item.id));
    expect(kept.categoryId).toBe(f.keep.id);
  });

  test("preserves existing order and item snapshots", async ({ request }) => {
    const f = await fixture();
    const [order] = await f.db.insert(orders).values({
      organizationId: f.restaurant.id, orderDate: "2026-11-18", orderNo: 1,
      customerName: "Historical customer", customerToken: randomUUID(), fulfilmentType: "PICKUP",
      categoryId: f.empty.id, categoryName: f.empty.name, drinkId: "old-item", drinkName: "Previously ordered item",
    }).returning();
    const [orderItem] = await f.db.insert(orderItems).values({
      organizationId: f.restaurant.id, orderId: order.id, categoryId: f.empty.id,
      categoryName: f.empty.name, drinkId: "old-item", drinkName: "Previously ordered item", unitPrice: "5.00",
    }).returning();
    await signIn(request, f);
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(200);
    expect((await f.db.select().from(orders).where(eq(orders.id, order.id)))[0]).toEqual(order);
    expect((await f.db.select().from(orderItems).where(eq(orderItems.id, orderItem.id)))[0]).toEqual(orderItem);
  });

  test("removes only this category's schedule binding, not the shared schedule", async ({ request }) => {
    const f = await fixture();
    const [schedule] = await f.db.insert(menuAvailabilitySchedules).values({ organizationId: f.restaurant.id, name: "Lunch hours" }).returning();
    await f.db.insert(menuCategoryAvailabilitySchedules).values([f.empty, f.keep].map((category) => ({ organizationId: f.restaurant.id, categoryId: category.id, scheduleId: schedule.id })));
    await signIn(request, f);
    expect((await request.delete(endpoint(f.empty.id))).status()).toBe(200);
    expect(await f.db.select().from(menuAvailabilitySchedules).where(eq(menuAvailabilitySchedules.id, schedule.id))).toHaveLength(1);
    const bindings = await f.db.select().from(menuCategoryAvailabilitySchedules).where(eq(menuCategoryAvailabilitySchedules.scheduleId, schedule.id));
    expect(bindings.map((binding) => binding.categoryId)).toEqual([f.keep.id]);
  });

  test("concurrent duplicate requests delete and audit only once", async ({ request }) => {
    const f = await fixture();
    await signIn(request, f);
    const responses = await Promise.all([request.delete(endpoint(f.empty.id)), request.delete(endpoint(f.empty.id))]);
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 404]);
    expect(await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.empty.id))).toHaveLength(1);
  });

  for (const change of ["insert", "move"] as const) {
    test(`waits for an in-flight product ${change} and refuses deletion`, async ({ request }) => {
      const f = await fixture();
      await signIn(request, f);
      const [source] = change === "move" ? await f.db.insert(menuItems).values(itemValues(f, f.keep.id)).returning() : [];
      let ready!: () => void;
      let release!: () => void;
      const inserted = new Promise<void>((resolve) => { ready = resolve; });
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const writer = f.db.transaction(async (tx) => {
        if (source) await tx.update(menuItems).set({ categoryId: f.empty.id }).where(eq(menuItems.id, source.id));
        else await tx.insert(menuItems).values(itemValues(f));
        ready();
        await hold;
      });
      await inserted;
      let settled = false;
      const deletion = request.delete(endpoint(f.empty.id)).finally(() => { settled = true; });
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(settled).toBe(false);
      } finally { release(); }
      await writer;
      expect((await deletion).status()).toBe(409);
      expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.empty.id))).toHaveLength(1);
      expect(await f.db.select().from(menuItems).where(eq(menuItems.categoryId, f.empty.id))).toHaveLength(1);
    });
  }

  for (const width of [440, 1440]) {
    test(`UI confirms deletion, supports cancel and preserves other categories at ${width}px`, async ({ page }) => {
      const f = await fixture();
      await page.setViewportSize({ width, height: 956 });
      await signIn(page.request, f);
      await page.goto(`${appUrl}/restaurants/${f.restaurant.slug}/menu`);
      const trigger = page.getByRole("button", { name: `Delete category ${f.empty.name}`, exact: true });
      await trigger.click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Existing orders and other categories will not be changed");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await f.db.select().from(menuCategories).where(eq(menuCategories.id, f.empty.id))).toHaveLength(1);
      await trigger.click();
      await page.screenshot({ path: test.info().outputPath("confirm-category-deletion.png"), animations: "disabled" });
      await dialog.getByRole("button", { name: "Delete category", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toHaveCount(0);
      await expect(page.getByRole("heading", { name: f.keep.name, exact: true })).toBeVisible();
    });
  }

  test("UI explains why a nonempty category cannot be deleted", async ({ page }) => {
    const f = await fixture();
    await f.db.insert(menuItems).values(itemValues(f));
    await signIn(page.request, f);
    await page.goto(`${appUrl}/restaurants/${f.restaurant.slug}/menu`);
    await page.getByRole("button", { name: `Delete category ${f.empty.name}`, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("This category contains products");
    await expect(dialog.getByRole("button", { name: "Delete category", exact: true })).toBeDisabled();
  });

  test("UI handles a category that gains a product after the page was loaded", async ({ page }) => {
    const f = await fixture();
    await page.setViewportSize({ width: 440, height: 956 });
    await signIn(page.request, f);
    await page.goto(`${appUrl}/restaurants/${f.restaurant.slug}/menu`);
    const trigger = page.getByRole("button", { name: `Delete category ${f.empty.name}`, exact: true });
    await expect(trigger).toBeVisible();
    await f.db.insert(menuItems).values(itemValues(f));
    await trigger.click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete category", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Move all products");
    await page.screenshot({ path: test.info().outputPath("blocked-category-deletion.png"), animations: "disabled" });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(trigger).toBeVisible();
  });
});
