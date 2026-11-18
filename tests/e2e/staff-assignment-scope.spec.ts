import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { getDb } from "@/db";
import { memberships, organizations, organizationSubscriptions, saasPlans, users } from "@/db/schema";
import { hashPassword } from "@/lib/passwords";

const databaseUrl = process.env.E2E_STAFF_ASSIGNMENT_DATABASE_URL;
const appUrl = process.env.E2E_STAFF_ASSIGNMENT_APP_URL;
const password = "LocalStaffAssignment123!";

test.describe("staff assignment scope", () => {
  test.skip(!databaseUrl || !appUrl, "Set isolated local E2E_STAFF_ASSIGNMENT_DATABASE_URL and E2E_STAFF_ASSIGNMENT_APP_URL.");
  test.beforeAll(() => {
    const dbUrl = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.pathname !== "/foodie_staff_assignment" ||
      !["127.0.0.1", "localhost"].includes(new URL(appUrl!).hostname)) {
      throw new Error("Staff assignment checks require the isolated local foodie_staff_assignment database and local application.");
    }
    process.env.DATABASE_URL = databaseUrl;
  });

  async function fixture(owner: "active" | "disabled" | "other-company" | "none" = "active") {
    const db = getDb();
    const suffix = randomUUID();
    const [company, otherCompany] = await db.insert(organizations).values(["Company", "Other"].map((name) => ({
      name, slug: `${name.toLowerCase()}-${suffix}`, type: "COMPANY" as const, timezone: "Europe/London", currency: "GBP",
    }))).returning();
    const [plan] = await db.select().from(saasPlans).limit(1);
    await db.insert(organizationSubscriptions).values([company, otherCompany].map((organization) => ({
      organizationId: organization.id, planId: plan.id, status: "ACTIVE" as const,
    })));
    const [source, destination] = await db.insert(organizations).values(["Source", "Destination"].map((name) => ({
      name, slug: `${name.toLowerCase()}-${suffix}`, type: "RESTAURANT" as const,
      parentOrganizationId: company.id, timezone: "Europe/London", currency: "GBP",
    }))).returning();
    const passwordHash = await hashPassword(password);
    const [actor, johnny, local] = await db.insert(users).values(["Manager", "Johnny", "Local"].map((name) => ({
      name, username: `${name.toLowerCase()}-${suffix}`, email: `${name.toLowerCase()}+${suffix}@example.com`,
      passwordHash, role: "ADMIN" as const,
    }))).returning();
    const [restaurantAccess] = await db.insert(memberships).values({ userId: actor.id, organizationId: destination.id, role: "RESTAURANT_MANAGER" }).returning();
    const [companyAccess] = owner === "none" ? [] : await db.insert(memberships).values({
      userId: actor.id, organizationId: owner === "other-company" ? otherCompany.id : company.id,
      role: "COMPANY_OWNER", isActive: owner !== "disabled",
    }).returning();
    const [johnnyAccess, localAccess] = await db.insert(memberships).values([
      { userId: johnny.id, organizationId: source.id, role: "ORDER_OPERATOR" as const },
      { userId: local.id, organizationId: destination.id, role: "ORDER_OPERATOR" as const, isActive: false },
    ]).returning();
    return { db, company, source, destination, actor, johnny, local, restaurantAccess, companyAccess, johnnyAccess, localAccess };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function signIn(request: APIRequestContext, f: Fixture) {
    const { csrfToken } = await (await request.get(`${appUrl}/api/auth/csrf`)).json();
    await request.post(`${appUrl}/api/auth/callback/credentials`, {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { username: f.actor.username, password, csrfToken, callbackUrl: appUrl! },
    });
    expect((await request.patch(`${appUrl}/api/session/memberships`, { data: { membershipId: f.restaurantAccess.id } })).status()).toBe(200);
    expect((await (await request.get(`${appUrl}/api/auth/session`)).json()).user?.role).toBe("RESTAURANT_MANAGER");
  }
  function restaurantPath(f: Fixture) { return `${appUrl}/restaurants/${f.destination.slug}/staff/reassign`; }

  for (const owner of ["none", "disabled", "other-company"] as const) {
    test(`does not offer company handoff with ${owner} owner access`, async ({ page }) => {
      const f = await fixture(owner);
      await signIn(page.request, f);
      await page.goto(restaurantPath(f));
      await expect(page.getByRole("heading", { name: "Reactivate or update staff access", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Assign company user", exact: true })).toHaveCount(0);
      await page.getByRole("combobox").first().fill(f.johnny.email);
      await expect(page.getByRole("listbox")).toContainText("linked to this restaurant");
      await expect(page.getByRole("option").filter({ hasText: f.johnny.email })).toHaveCount(0);
      const result = await page.request.post(`${appUrl}/api/tenant/admin/staff/reassign`, {
        data: { identifier: f.johnny.email, organizationId: f.destination.id, role: "ORDER_OPERATOR", deactivateExisting: false },
      });
      expect(result.ok()).toBe(false);
      expect((await result.json()).error).toContain("outside your access scope");
      expect(await f.db.select().from(memberships).where(and(eq(memberships.userId, f.johnny.id), eq(memberships.organizationId, f.destination.id)))).toHaveLength(0);
    });
  }

  for (const width of [440, 1440]) {
    test(`switches company context and adds sibling-restaurant staff without disabling old access at ${width}px`, async ({ page }) => {
      const f = await fixture();
      await page.setViewportSize({ width, height: 956 });
      await signIn(page.request, f);
      await page.goto(`${appUrl}/restaurants/${f.destination.slug}/staff`);
      await page.getByRole("link", { name: "Reactivate or update staff access", exact: true }).click();
      await expect(page).toHaveURL(restaurantPath(f));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("combobox").first().fill(f.johnny.email);
      await expect(page.getByRole("listbox")).toContainText("assigned by a company owner");
      await expect(page.locator('[data-slot="route-transition-overlay"]')).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("restaurant-assignment.png") });
      await page.getByRole("button", { name: "Assign company user", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/companies/${f.company.slug}/users/reassign\\?`));
      await expect(page.getByRole("combobox").first()).toHaveValue(f.johnny.email);
      await expect(page.getByRole("checkbox", { name: "Disable current active access" })).not.toBeChecked();
      expect((await (await page.request.get(`${appUrl}/api/auth/session`)).json()).user?.role).toBe("COMPANY_OWNER");
      const url = new URL(page.url());
      expect(url.searchParams.get("restaurantSlug")).toBe(f.destination.slug);
      expect(url.searchParams.get("identifier")).toBe(f.johnny.email);
      await expect(page.locator('[data-slot="route-transition-overlay"]')).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("company-assignment.png") });
      await page.getByRole("button", { name: "Assign user", exact: true }).click();
      await page.getByRole("button", { name: "Confirm assignment", exact: true }).click();
      await expect(page).toHaveURL(`${appUrl}/companies/${f.company.slug}/restaurants/${f.destination.slug}/staff`);
      const access = await f.db.select().from(memberships).where(eq(memberships.userId, f.johnny.id));
      expect(access).toHaveLength(2);
      expect(access.every((membership) => membership.isActive)).toBe(true);
      expect(access.map((membership) => membership.organizationId).sort()).toEqual([f.source.id, f.destination.id].sort());
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("rechecks company access when an owner handoff is revoked after page load", async ({ page }) => {
    const f = await fixture();
    await signIn(page.request, f);
    await page.goto(restaurantPath(f));
    await f.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, f.companyAccess!.id));
    await page.getByRole("button", { name: "Assign company user", exact: true }).click();
    await expect(page.getByText("Membership access not found.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(restaurantPath(f));
    expect((await (await page.request.get(`${appUrl}/api/auth/session`)).json()).user?.role).toBe("RESTAURANT_MANAGER");
  });

  test("restaurant-local inactive memberships can still be reactivated", async ({ page }) => {
    const f = await fixture("none");
    await signIn(page.request, f);
    await page.goto(restaurantPath(f));
    await page.getByRole("combobox").first().fill(f.local.email);
    await expect(page.getByRole("option").filter({ hasText: f.local.email })).toBeVisible();
    await page.getByRole("button", { name: "Update access", exact: true }).click();
    await page.getByRole("button", { name: "Confirm access update", exact: true }).click();
    await expect(page).toHaveURL(`${appUrl}/restaurants/${f.destination.slug}/staff`);
    const [membership] = await f.db.select().from(memberships).where(eq(memberships.id, f.localAccess.id));
    expect(membership.isActive).toBe(true);
    const [source] = await f.db.select().from(memberships).where(eq(memberships.id, f.johnnyAccess.id));
    expect(source.isActive).toBe(true);
  });

  test("normal company entry retains its original move-access default", async ({ page }) => {
    const f = await fixture();
    await signIn(page.request, f);
    expect((await page.request.patch(`${appUrl}/api/session/memberships`, { data: { membershipId: f.companyAccess!.id } })).status()).toBe(200);
    await page.goto(`${appUrl}/companies/${f.company.slug}/users/reassign`);
    await expect(page.getByRole("checkbox", { name: "Disable current active access" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Assign user", exact: true })).toBeVisible();
  });
});
