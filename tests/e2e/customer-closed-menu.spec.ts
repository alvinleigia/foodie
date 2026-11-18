import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { getDb } from "@/db";
import {
  memberships, menuCategories, menuItemModifierGroups, menuItems, modifierGroups,
  modifierOptions, orderingPoints, orders, organizationFeatureOverrides,
  organizations, organizationSubscriptions, prepStations, restaurantOrderingPeriods,
  saasFeatures, saasPlans, tenantDomains, users,
} from "@/db/schema";
import { hashPassword } from "@/lib/passwords";
import { getCurrentBusinessDate } from "@/lib/business-date";
import type { RestaurantWorkingHoursPeriod } from "@/lib/working-hours";

const databaseUrl = process.env.E2E_CLOSED_MENU_DATABASE_URL;
const appUrl = process.env.E2E_CLOSED_MENU_APP_URL;

test.describe("customer menu outside working hours", () => {
  test.skip(!databaseUrl || !appUrl, "Set isolated local E2E_CLOSED_MENU_DATABASE_URL and E2E_CLOSED_MENU_APP_URL.");
  test.beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/foodie_ordering_hours" ||
      !["localhost", "127.0.0.1"].includes(new URL(appUrl!).hostname)) {
      throw new Error("Closed-menu tests require the isolated local foodie_ordering_hours database and local application.");
    }
    process.env.DATABASE_URL = databaseUrl;
  });

  async function fixture() {
    const db = getDb();
    const suffix = randomUUID();
    const [company] = await db.insert(organizations).values({ name: "Company", slug: `company-${suffix}`, type: "COMPANY", timezone: "Europe/London", currency: "GBP" }).returning();
    const [plan] = await db.select().from(saasPlans).limit(1);
    await db.insert(organizationSubscriptions).values({ organizationId: company.id, planId: plan.id, status: "ACTIVE" });
    const [restaurant] = await db.insert(organizations).values({
      name: "Test restaurant", slug: `restaurant-${suffix}`, type: "RESTAURANT", parentOrganizationId: company.id,
      timezone: "Europe/London", currency: "GBP", customerOrderingHoursEnabled: true,
    }).returning();
    const features = await db.select().from(saasFeatures);
    await db.insert(organizationFeatureOverrides).values(features.map((feature) => ({ organizationId: restaurant.id, featureId: feature.id, enabled: true })));
    const [point] = await db.insert(orderingPoints).values({ organizationId: restaurant.id, name: restaurant.name, slug: "main", qrSlug: `qr-${suffix}`, isDefault: true, label: "London" }).returning();
    await db.insert(tenantDomains).values({ domain: "127.0.0.1", scope: "COMPANY", purpose: "ORDERING", companyOrganizationId: company.id })
      .onConflictDoUpdate({ target: tenantDomains.domain, set: { companyOrganizationId: company.id } });
    const [station] = await db.insert(prepStations).values({ organizationId: restaurant.id, name: "Kitchen", slug: "kitchen", type: "KITCHEN" }).returning();
    const [category] = await db.insert(menuCategories).values({ organizationId: restaurant.id, name: "Food", slug: "food" }).returning();
    const [plain, custom] = await db.insert(menuItems).values(["Plain meal", "Custom meal"].map((name, index) => ({
      organizationId: restaurant.id, categoryId: category.id, prepStationId: station.id, name, slug: `meal-${index}`, price: "5.00", sortOrder: index,
    }))).returning();
    const [group] = await db.insert(modifierGroups).values({ organizationId: restaurant.id, name: "Sauce", slug: "sauce" }).returning();
    await db.insert(modifierOptions).values({ organizationId: restaurant.id, groupId: group.id, name: "Ketchup", slug: "ketchup" });
    await db.insert(menuItemModifierGroups).values({ menuItemId: custom.id, modifierGroupId: group.id });
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", weekday: "short" }).format(new Date());
    const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    const tomorrow = { dayOfWeek: (today + 1) % 7, opensAtMinute: 9 * 60, closesAtMinute: 22 * 60, is24Hours: false };
    await db.insert(restaurantOrderingPeriods).values({ ...tomorrow, organizationId: restaurant.id });
    return { db, restaurant, category, plain, point, today, tomorrow, menuUrl: `${appUrl}/order?qr=${point.qrSlug}` };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function hours(f: Fixture, periods: RestaurantWorkingHoursPeriod[], enabled = true) {
    await f.db.transaction(async (tx) => {
      await tx.update(organizations).set({ customerOrderingHoursEnabled: enabled }).where(eq(organizations.id, f.restaurant.id));
      await tx.delete(restaurantOrderingPeriods).where(eq(restaurantOrderingPeriods.organizationId, f.restaurant.id));
      if (periods.length) await tx.insert(restaurantOrderingPeriods).values(periods.map((period) => ({ ...period, organizationId: f.restaurant.id })));
    });
  }

  for (const theme of ["light", "dark"]) {
    for (const width of [440, 1440]) {
      test(`closed restaurant keeps a searchable menu in ${theme} at ${width}px`, async ({ page }) => {
        const f = await fixture();
        await page.setViewportSize({ width, height: 956 });
        await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme);
        await page.goto(f.menuUrl);
        await expect(page.getByRole("heading", { name: f.restaurant.name, exact: true })).toBeVisible();
        const notice = page.locator('[data-slot="ordering-closed-notice"]:visible');
        await expect(notice).toHaveCount(1);
        await expect(notice).toContainText("Opens tomorrow at 09:00 (Europe/London)");
        await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Customize", exact: true })).toBeDisabled();
        await expect(page.getByText("Plain meal", { exact: true })).toBeVisible();
        await expect(page.getByText("Custom meal", { exact: true })).toBeVisible();
        await page.getByRole("searchbox", { name: "Search menu" }).fill("Custom");
        await expect(page.getByText("Plain meal", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Custom meal", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Customize", exact: true })).toBeDisabled();
        await page.getByRole("searchbox", { name: "Search menu" }).clear();
        await page.screenshot({ path: test.info().outputPath("closed-menu.png"), fullPage: true, animations: "disabled" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
  }

  test("route-slug menu remains visible and customer creation still rejects closed orders", async ({ page, request }) => {
    const f = await fixture();
    await page.goto(`${appUrl}/order/${f.restaurant.slug}`);
    await expect(page.getByRole("heading", { name: f.restaurant.name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
    const response = await request.post(`${appUrl}/api/orders?qr=${f.point.qrSlug}`, { data: {
      checkoutMode: "GUEST", paymentTiming: "ONLINE", fulfilmentType: "PICKUP",
      customerContact: { name: "Guest test", email: "guest@example.com", phone: null },
      items: [{ categoryId: f.category.id, drinkId: f.plain.id, quantity: 1 }],
    } });
    expect(await response.json()).toMatchObject({ error: "This restaurant is currently closed for customer orders." });
    expect(response.status()).toBe(409);
    expect(await f.db.select().from(orders).where(eq(orders.organizationId, f.restaurant.id))).toHaveLength(0);
  });

  test("an entirely closed week does not promise an opening time", async ({ page }) => {
    const f = await fixture();
    await hours(f, []);
    await page.goto(f.menuUrl);
    const notice = page.locator('[data-slot="ordering-closed-notice"]:visible');
    await expect(notice).toHaveCount(1);
    await expect(notice).toHaveText("We're not taking orders right now. You can still browse the menu.");
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  });

  test("disabling enforcement restores adding, customization and review", async ({ page }) => {
    const f = await fixture();
    await hours(f, [], false);
    await page.goto(f.menuUrl);
    await expect(page.locator('[data-slot="ordering-closed-notice"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Add to Cart", exact: true }).click();
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Review Order", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review and pay", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Proceed to Payment", exact: true })).toBeEnabled();
  });

  test("closing and reopening refresh review controls without losing the cart", async ({ page }) => {
    const f = await fixture();
    const allDay = { dayOfWeek: f.today, is24Hours: true, opensAtMinute: 0, closesAtMinute: 0 };
    await hours(f, [allDay]);
    await page.goto(f.menuUrl);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Review Order", exact: true }).click();
    // Keep the browser's simulated boundary and the server fixture in the same open/closed state.
    const tomorrow = new Date(`${getCurrentBusinessDate("Europe/London")}T03:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(3, 0, 0, 0);
    await hours(f, [f.tomorrow]);
    await page.clock.setFixedTime(tomorrow);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator('[data-slot="ordering-closed-notice"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Proceed to Payment", exact: true })).toBeDisabled();
    await expect(page.getByText("Plain meal x1", { exact: true })).toBeVisible();
    await hours(f, [allDay]);
    tomorrow.setUTCHours(12);
    await page.clock.setFixedTime(tomorrow);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator('[data-slot="ordering-closed-notice"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Proceed to Payment", exact: true })).toBeEnabled();
    await expect(page.getByText("Plain meal x1", { exact: true })).toBeVisible();
  });

  test("staff can still take orders outside customer hours", async ({ page }) => {
    const f = await fixture();
    const password = "LocalHoursTest123!";
    const [user] = await f.db.insert(users).values({ username: `manager-${randomUUID()}`, name: "Manager", email: `${randomUUID()}@example.com`, role: "ADMIN", passwordHash: await hashPassword(password) }).returning();
    await f.db.insert(memberships).values({ userId: user.id, organizationId: f.restaurant.id, role: "RESTAURANT_MANAGER" });
    const { csrfToken } = await (await page.request.get(`${appUrl}/api/auth/csrf`)).json();
    await page.request.post(`${appUrl}/api/auth/callback/credentials`, { headers: { "X-Auth-Return-Redirect": "1" }, form: { username: user.username, password, csrfToken, callbackUrl: appUrl! } });
    await page.goto(`${appUrl}/restaurants/${f.restaurant.slug}/order`);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
    await expect(page.locator('[data-slot="ordering-closed-notice"]')).toHaveCount(0);
  });
});
