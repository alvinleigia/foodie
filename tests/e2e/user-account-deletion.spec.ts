import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { getDb } from "@/db";
import {
  auditLogs, memberships, organizations, organizationSubscriptions, passwordResetTokens,
  restaurantJobs, saasPlans, staffInvitations, staffJobAssignments, staffPayrollProfiles, users,
} from "@/db/schema";
import { hashPassword } from "@/lib/passwords";
import { deleteUserAccount } from "@/lib/user-account-deletion";

const databaseUrl = process.env.E2E_ACCOUNT_DELETION_DATABASE_URL;
const appUrl = process.env.E2E_ACCOUNT_DELETION_APP_URL;

test.describe("complete user account deletion", () => {
  test.skip(!databaseUrl, "Set E2E_ACCOUNT_DELETION_DATABASE_URL to an isolated local database.");
  test.beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/foodie_account_deletion") {
      throw new Error("Account deletion tests require the isolated local foodie_account_deletion database.");
    }
    if (appUrl && !["127.0.0.1", "localhost"].includes(new URL(appUrl).hostname)) {
      throw new Error("Account deletion tests may only use a local application.");
    }
    process.env.DATABASE_URL = databaseUrl;
  });

  async function fixture(platform = false) {
    const db = getDb();
    const suffix = randomUUID();
    const [company, otherCompany, platformOrg] = await db.insert(organizations).values([
      { name: "Company", slug: `company-${suffix}`, type: "COMPANY" as const },
      { name: "Other company", slug: `other-${suffix}`, type: "COMPANY" as const },
      { name: "Platform", slug: `platform-${suffix}`, type: "PLATFORM" as const },
    ].map((organization) => ({ ...organization, timezone: "Europe/London", currency: "GBP" }))).returning();
    const [plan] = await db.select().from(saasPlans).limit(1);
    await db.insert(organizationSubscriptions).values({ organizationId: company.id, planId: plan.id, status: "ACTIVE" });
    const restaurants = await db.insert(organizations).values([0, 1].map((index) => ({
      name: `Restaurant ${index}`, slug: `restaurant-${suffix}-${index}`, type: "RESTAURANT" as const,
      parentOrganizationId: company.id, timezone: "Europe/London", currency: "GBP",
    }))).returning();
    const [actor, targetUser] = await db.insert(users).values(["Owner", "Delete Test"].map((name) => ({
      username: `${name.replaceAll(" ", "-").toLowerCase()}-${suffix}`, name,
      email: `${name.replaceAll(" ", "-").toLowerCase()}-${suffix}@example.com`, role: "ADMIN" as const,
    }))).returning();
    const [actorMembership, target] = await db.insert(memberships).values([
      { userId: actor.id, organizationId: platform ? platformOrg.id : company.id, role: platform ? "PLATFORM_ADMIN" as const : "COMPANY_OWNER" as const },
      { userId: targetUser.id, organizationId: restaurants[0].id, role: "ORDER_OPERATOR" as const },
    ]).returning();
    return {
      db, company, otherCompany, platformOrg, restaurants, target, targetUser,
      editor: { id: actor.id, username: actor.username, role: actorMembership.role, organizationId: actorMembership.organizationId },
      actorMembership,
    };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function remove(f: Fixture, changes: Partial<Parameters<typeof deleteUserAccount>[0]> = {}) {
    return deleteUserAccount({ membershipId: f.target.id, confirmationEmail: f.targetUser.email, editor: f.editor, ...changes });
  }
  async function assertRetained(f: Fixture) {
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
  }
  async function signIn(request: APIRequestContext, f: Fixture, target = false) {
    const userId = target ? f.targetUser.id : f.editor.id;
    const username = target ? f.targetUser.username : f.editor.username;
    const password = "LocalAccountDeletion123!";
    await f.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
    const { csrfToken } = await (await request.get(`${appUrl}/api/auth/csrf`)).json();
    await request.post(`${appUrl}/api/auth/callback/credentials`, {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { username, password, csrfToken, callbackUrl: appUrl! },
    });
    expect((await (await request.get(`${appUrl}/api/auth/session`)).json()).user?.id).toBe(userId);
  }
  function endpoint(id: string) { return `${appUrl}/api/users/${id}/account`; }

  test("deletes active accounts, all in-company access, setup and reset links with one audit entry", async () => {
    const f = await fixture();
    const [other] = await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.restaurants[1].id, role: "ORDER_OPERATOR" }).returning();
    const [job] = await f.db.insert(restaurantJobs).values({ organizationId: f.restaurants[0].id, name: "Operator" }).returning();
    await f.db.insert(staffJobAssignments).values({ organizationId: f.restaurants[0].id, membershipId: f.target.id, jobId: job.id });
    await f.db.insert(staffInvitations).values({ userId: f.targetUser.id, membershipId: f.target.id, tokenHash: randomUUID(), expiresAt: new Date(), acceptedAt: new Date() });
    await f.db.insert(passwordResetTokens).values({ userId: f.targetUser.id, requestedByUserId: f.editor.id, tokenHash: randomUUID(), expiresAt: new Date() });
    const result = await remove(f);
    expect(result?.deletedUserId).toBe(f.targetUser.id);
    expect(result?.deletedMembershipIds.sort()).toEqual([f.target.id, other.id].sort());
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(0);
    expect(await f.db.select().from(memberships).where(eq(memberships.userId, f.targetUser.id))).toHaveLength(0);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.userId, f.targetUser.id))).toHaveLength(0);
    expect(await f.db.select().from(staffJobAssignments).where(eq(staffJobAssignments.membershipId, f.target.id))).toHaveLength(0);
    expect(await f.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, f.targetUser.id))).toHaveLength(0);
    const [audit] = await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.targetUser.id));
    expect(audit).toMatchObject({ actorUserId: f.editor.id, action: "user.account.delete", metadata: { accountDeleted: true } });
  });

  for (const status of ["INVITED", "DISABLED"] as const) {
    test(`also supports unused ${status.toLowerCase()} accounts`, async () => {
      const f = await fixture();
      await f.db.update(users).set({ status }).where(eq(users.id, f.targetUser.id));
      expect((await remove(f))?.deletedUserId).toBe(f.targetUser.id);
    });
  }

  test("requires exact current email confirmation and blocks self-deletion", async () => {
    const f = await fixture();
    await expect(remove(f, { confirmationEmail: "wrong@example.com" })).rejects.toMatchObject({ status: 400 });
    await expect(remove(f, { membershipId: f.actorMembership.id, confirmationEmail: "owner@example.com" })).rejects.toMatchObject({ status: 400, message: "You cannot delete your own account." });
    await assertRetained(f);
  });

  test("restaurant roles cannot delete global accounts even with staff.manage", async () => {
    const f = await fixture();
    for (const role of ["RESTAURANT_MANAGER", "ORDER_OPERATOR"] as const) {
      await expect(remove(f, { editor: { ...f.editor, role } })).rejects.toMatchObject({ status: 403 });
    }
    await assertRetained(f);
  });

  test("company owners cannot find out-of-scope accounts", async () => {
    const f = await fixture();
    expect(await remove(f, { editor: { ...f.editor, organizationId: f.otherCompany.id } })).toBeNull();
    await assertRetained(f);
  });

  test("company owners cannot delete accounts with even inactive access outside the company", async () => {
    const f = await fixture();
    await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherCompany.id, role: "COMPANY_OWNER", isActive: false });
    await expect(remove(f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("outside your company") });
    await assertRetained(f);
  });

  test("platform administrators can delete unused accounts shared across companies", async () => {
    const f = await fixture(true);
    await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherCompany.id, role: "COMPANY_OWNER", isActive: false });
    expect((await remove(f))?.deletedMembershipIds).toHaveLength(2);
  });

  test("platform accounts remain protected even when their platform access is disabled", async () => {
    const f = await fixture(true);
    await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.platformOrg.id, role: "PLATFORM_ADMIN", isActive: false });
    await expect(remove(f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Platform administrator") });
    await assertRetained(f);
  });

  for (const role of ["COMPANY_OWNER", "RESTAURANT_MANAGER"] as const) {
    test(`cannot delete the last active ${role.toLowerCase()}`, async () => {
      const f = await fixture(true);
      await f.db.update(memberships).set({ role, organizationId: role === "COMPANY_OWNER" ? f.company.id : f.restaurants[0].id }).where(eq(memberships.id, f.target.id));
      await expect(remove(f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("last active") });
      await assertRetained(f);
    });
  }

  test("membership history cannot disappear through CASCADE", async () => {
    const f = await fixture();
    await f.db.insert(staffPayrollProfiles).values({ organizationId: f.restaurants[0].id, membershipId: f.target.id, employeeReference: "KEEP" });
    await expect(remove(f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("linked records") });
    await assertRetained(f);
  });

  test("user history anywhere blocks deletion and restores invitations and reset links", async () => {
    const f = await fixture();
    await f.db.insert(staffInvitations).values({ userId: f.targetUser.id, membershipId: f.target.id, tokenHash: randomUUID(), expiresAt: new Date() });
    await f.db.insert(passwordResetTokens).values({ userId: f.targetUser.id, tokenHash: randomUUID(), expiresAt: new Date() });
    await f.db.insert(auditLogs).values({ organizationId: f.otherCompany.id, actorUserId: f.targetUser.id, action: "history", entityType: "example" });
    await expect(remove(f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("linked records") });
    await assertRetained(f);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.userId, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, f.targetUser.id))).toHaveLength(1);
  });

  test("reset links created by the target for someone else are protected activity", async () => {
    const f = await fixture();
    await f.db.insert(passwordResetTokens).values({ userId: f.editor.id, requestedByUserId: f.targetUser.id, tokenHash: randomUUID(), expiresAt: new Date() });
    await expect(remove(f)).rejects.toMatchObject({ status: 409 });
    await assertRetained(f);
  });

  test("failed auditing rolls back deletion", async () => {
    const f = await fixture();
    await expect(remove(f, { editor: { ...f.editor, id: randomUUID() } })).rejects.toThrow();
    await assertRetained(f);
  });

  test("concurrent duplicate requests delete and audit only once", async () => {
    const f = await fixture();
    const results = await Promise.all([remove(f), remove(f)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.targetUser.id))).toHaveLength(1);
  });

  test("concurrent deletion cannot remove both remaining managers", async () => {
    const f = await fixture();
    await f.db.update(memberships).set({ role: "RESTAURANT_MANAGER" }).where(eq(memberships.id, f.target.id));
    const [otherUser] = await f.db.insert(users).values({ username: randomUUID(), name: "Other manager", email: `${randomUUID()}@example.com`, role: "ADMIN" }).returning();
    const [other] = await f.db.insert(memberships).values({ userId: otherUser.id, organizationId: f.restaurants[0].id, role: "RESTAURANT_MANAGER" }).returning();
    const results = await Promise.allSettled([remove(f), remove(f, { membershipId: other.id, confirmationEmail: otherUser.email })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(and(eq(memberships.organizationId, f.restaurants[0].id), eq(memberships.role, "RESTAURANT_MANAGER")))).toHaveLength(1);
  });

  test("concurrent access assignments cannot be silently deleted", async () => {
    const f = await fixture();
    let inserted!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { inserted = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const writer = f.db.transaction(async (tx) => {
      await tx.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherCompany.id, role: "COMPANY_OWNER", isActive: false });
      inserted();
      await hold;
    });
    await ready;
    let settled = false;
    const removal = remove(f).catch((error) => error).finally(() => { settled = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally { release(); }
    await writer;
    expect(await removal).toMatchObject({ status: 409 });
    await assertRetained(f);
    expect(await f.db.select().from(memberships).where(eq(memberships.userId, f.targetUser.id))).toHaveLength(2);
  });

  test("API rejects anonymous callers and restaurant roles", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_ACCOUNT_DELETION_APP_URL for local API checks.");
    const f = await fixture();
    expect((await request.delete(endpoint(f.target.id), { data: { confirmationEmail: f.targetUser.email } })).status()).toBe(401);
    await signIn(request, f, true);
    expect((await request.delete(endpoint(f.target.id), { data: { confirmationEmail: f.targetUser.email } })).status()).toBe(401);
    await assertRetained(f);
  });

  test("API validates IDs, email, access scope and linked records", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_ACCOUNT_DELETION_APP_URL for local API checks.");
    const f = await fixture();
    await signIn(request, f);
    expect((await request.delete(endpoint("invalid"), { data: {} })).status()).toBe(400);
    expect((await request.delete(endpoint(f.target.id), { data: {} })).status()).toBe(400);
    expect((await request.delete(endpoint(f.target.id), { data: { confirmationEmail: "wrong@example.com" } })).status()).toBe(400);
    const [outside] = await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherCompany.id, role: "COMPANY_OWNER", isActive: false }).returning();
    expect((await request.delete(endpoint(outside.id), { data: { confirmationEmail: f.targetUser.email } })).status()).toBe(404);
    expect((await request.delete(endpoint(f.target.id), { data: { confirmationEmail: f.targetUser.email } })).status()).toBe(409);
    await f.db.delete(memberships).where(eq(memberships.id, outside.id));
    await f.db.insert(staffPayrollProfiles).values({ organizationId: f.restaurants[0].id, membershipId: f.target.id, employeeReference: "KEEP" });
    expect((await request.delete(endpoint(f.target.id), { data: { confirmationEmail: f.targetUser.email } })).status()).toBe(409);
    await assertRetained(f);
  });

  test("API deletes the account and invalidates its existing login session", async ({ request, playwright }) => {
    test.skip(!appUrl, "Set E2E_ACCOUNT_DELETION_APP_URL for local API checks.");
    const f = await fixture();
    const targetSession = await playwright.request.newContext();
    try {
      await signIn(targetSession, f, true);
      await signIn(request, f);
      const response = await request.delete(endpoint(f.target.id), { data: { confirmationEmail: f.targetUser.email } });
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ deletedUserId: f.targetUser.id });
      expect((await (await targetSession.get(`${appUrl}/api/auth/session`)).json())?.user).toBeFalsy();
    } finally { await targetSession.dispose(); }
  });

  for (const width of [440, 1440]) {
    test(`company UI confirms email, supports cancel and removes every row at ${width}px`, async ({ page }) => {
      test.skip(!appUrl, "Set E2E_ACCOUNT_DELETION_APP_URL for local UI checks.");
      const f = await fixture();
      await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.restaurants[1].id, role: "ORDER_OPERATOR" });
      await page.setViewportSize({ width, height: 956 });
      await signIn(page.request, f);
      await page.goto(`${appUrl}/companies/${f.company.slug}/users`);
      await page.getByRole("button", { name: "Open actions for Owner", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Delete account", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open actions for Delete Test", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Delete account", exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByRole("button", { name: "Delete account", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await assertRetained(f);
      await page.getByRole("button", { name: "Open actions for Delete Test", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Delete account", exact: true }).click();
      await dialog.getByLabel("Confirm email address").fill("wrong@example.com");
      await expect(dialog.getByRole("button", { name: "Delete account", exact: true })).toBeDisabled();
      await dialog.getByLabel("Confirm email address").fill(f.targetUser.email);
      await page.screenshot({ path: test.info().outputPath("confirm-deletion.png") });
      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("Delete Test", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open actions for Owner", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`platform UI shows linked-record errors and keeps the user at ${width}px`, async ({ page }) => {
      test.skip(!appUrl, "Set E2E_ACCOUNT_DELETION_APP_URL for local UI checks.");
      const f = await fixture(true);
      await f.db.insert(staffPayrollProfiles).values({ organizationId: f.restaurants[0].id, membershipId: f.target.id, employeeReference: "KEEP" });
      await page.setViewportSize({ width, height: 956 });
      await signIn(page.request, f);
      await page.goto(`${appUrl}/platform/users/memberships`);
      const card = page.locator("div.rounded-lg").filter({ has: page.getByText(f.targetUser.email, { exact: false }) }).filter({ has: page.getByRole("button", { name: "Delete account", exact: true }) }).last();
      await card.getByRole("button", { name: "Delete account", exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog.getByLabel("Confirm email address").fill(f.targetUser.email);
      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("Disable its access");
      await page.screenshot({ path: test.info().outputPath("blocked-deletion.png") });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await assertRetained(f);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
