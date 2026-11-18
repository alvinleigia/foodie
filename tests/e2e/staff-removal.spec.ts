import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { getDb } from "@/db";
import {
  auditLogs, cashDrawerSessions, inventoryStockTransfers, memberships, orderingPoints,
  organizations, restaurantJobs, staffInvitations, staffJobAssignments, staffPayrollProfiles,
  staffScheduledShifts, users,
  organizationSubscriptions, passwordResetTokens, saasPlans,
} from "@/db/schema";
import { removeStaffMembership } from "@/lib/staff-removal";
import { hashPassword } from "@/lib/passwords";

const databaseUrl = process.env.E2E_STAFF_REMOVAL_DATABASE_URL;
const appUrl = process.env.E2E_STAFF_REMOVAL_APP_URL;

test.describe("guarded staff removal", () => {
  test.skip(!databaseUrl, "Set E2E_STAFF_REMOVAL_DATABASE_URL to an isolated local test database.");
  test.beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/foodie_staff_removal") {
      throw new Error("Staff removal tests may only run against the isolated local foodie_staff_removal database.");
    }
    process.env.DATABASE_URL = databaseUrl;
  });

  async function fixture(targetManager = false, actorManager = true) {
    const db = getDb();
    const suffix = randomUUID();
    const [company] = await db.insert(organizations).values({
      name: `Company ${suffix}`, slug: `company-${suffix}`, type: "COMPANY", timezone: "Europe/London", currency: "GBP",
    }).returning();
    const [plan] = await db.select().from(saasPlans).limit(1);
    await db.insert(organizationSubscriptions).values({ organizationId: company.id, planId: plan.id, status: "ACTIVE" });
    const [restaurant, otherRestaurant] = await db.insert(organizations).values([0, 1].map((index) => ({
      name: `Restaurant ${suffix} ${index}`, slug: `restaurant-${suffix}-${index}`, type: "RESTAURANT" as const,
      parentOrganizationId: company.id, timezone: "Europe/London", currency: "GBP",
    }))).returning();
    const [actorUser, targetUser] = await db.insert(users).values(["actor", "target"].map((name) => ({
      name, username: `${name}-${suffix}`, email: `${name}-${suffix}@example.com`, role: "ADMIN" as const, status: "ACTIVE" as const,
    }))).returning();
    const [actorMembership, target] = await db.insert(memberships).values([
      { userId: actorUser.id, organizationId: restaurant.id, role: actorManager ? "RESTAURANT_MANAGER" as const : "ORDER_OPERATOR" as const },
      { userId: targetUser.id, organizationId: restaurant.id, role: targetManager ? "RESTAURANT_MANAGER" as const : "ORDER_OPERATOR" as const },
    ]).returning();
    return {
      db, restaurant, otherRestaurant, target, targetUser,
      context: { organizationId: restaurant.id, orderingPointId: null },
      actor: { id: actorUser.id, membershipId: actorMembership.id, username: actorUser.username, role: actorMembership.role },
    };
  }

  async function expectBlocked(f: Awaited<ReturnType<typeof fixture>>) {
    await expect(removeStaffMembership(f.context, f.target.id, f.actor)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("linked records") });
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
  }

  async function inviteOnlyFixture() {
    const f = await fixture();
    await f.db.update(users).set({ status: "INVITED" }).where(eq(users.id, f.targetUser.id));
    await f.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, f.target.id));
    await f.db.insert(staffInvitations).values({ userId: f.targetUser.id, membershipId: f.target.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    return f;
  }

  async function signIn(request: APIRequestContext, f: Awaited<ReturnType<typeof fixture>>) {
    const url = new URL(appUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Staff removal API tests require a local application.");
    const password = "LocalStaffRemoval123!";
    await f.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, f.actor.id));
    const csrfResponse = await request.get(new URL("/api/auth/csrf", url).toString());
    const { csrfToken } = await csrfResponse.json();
    await request.post(new URL("/api/auth/callback/credentials", url).toString(), {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { username: f.actor.username, password, csrfToken, callbackUrl: appUrl! },
    });
    const session = await (await request.get(new URL("/api/auth/session", url).toString())).json();
    expect(session.user?.id).toBe(f.actor.id);
    expect(session.user?.membershipId).toBe(f.actor.membershipId);
  }

  function endpoint(id: string) {
    return new URL(`/api/tenant/admin/staff/${id}`, appUrl!).toString();
  }

  test("removes an unused membership, cancels invitations and preserves shared account access", async () => {
    const f = await fixture();
    const [otherMembership] = await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherRestaurant.id, role: "ORDER_OPERATOR" }).returning();
    await f.db.insert(staffInvitations).values({ userId: f.targetUser.id, membershipId: f.target.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    const [job] = await f.db.insert(restaurantJobs).values({ organizationId: f.restaurant.id, name: "Operator" }).returning();
    await f.db.insert(staffJobAssignments).values({ organizationId: f.restaurant.id, membershipId: f.target.id, jobId: job.id, isPrimary: true });
    const removed = await removeStaffMembership(f.context, f.target.id, f.actor);
    expect(removed?.id).toBe(f.target.id);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(0);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.membershipId, f.target.id))).toHaveLength(0);
    expect(await f.db.select().from(staffJobAssignments).where(eq(staffJobAssignments.membershipId, f.target.id))).toHaveLength(0);
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, otherMembership.id))).toHaveLength(1);
    const [audit] = await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.target.id));
    expect(audit.action).toBe("restaurant.staff.remove");
    expect(audit.metadata).toMatchObject({ userId: f.targetUser.id });
  });

  test("blocks payroll links that would otherwise cascade", async () => {
    const f = await fixture();
    await f.db.insert(staffPayrollProfiles).values({ organizationId: f.restaurant.id, membershipId: f.target.id, employeeReference: "EMP-1" });
    await expectBlocked(f);
    expect(await f.db.select().from(staffPayrollProfiles).where(eq(staffPayrollProfiles.membershipId, f.target.id))).toHaveLength(1);
  });

  test("deletes a sole unused invite account and frees its email and username", async () => {
    const f = await inviteOnlyFixture();
    await removeStaffMembership(f.context, f.target.id, f.actor);
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(0);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.userId, f.targetUser.id))).toHaveLength(0);
    const [audit] = await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.target.id));
    expect(audit.metadata).toMatchObject({ userId: f.targetUser.id, username: f.targetUser.username, accountDeleted: true });
    await expect(f.db.insert(users).values({ username: f.targetUser.username, name: "Reinvited", email: f.targetUser.email, role: "STAFF", status: "INVITED" })).resolves.toBeDefined();
  });

  test("keeps an invited account with inactive access and an invitation elsewhere", async () => {
    const f = await inviteOnlyFixture();
    const [other] = await f.db.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherRestaurant.id, role: "ORDER_OPERATOR", isActive: false }).returning();
    await f.db.insert(staffInvitations).values({ userId: f.targetUser.id, membershipId: other.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    await removeStaffMembership(f.context, f.target.id, f.actor);
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, other.id))).toHaveLength(1);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.membershipId, other.id))).toHaveLength(1);
  });

  for (const status of ["ACTIVE", "DISABLED"] as const) {
    test(`keeps a ${status.toLowerCase()} account even with an unaccepted invitation`, async () => {
      const f = await inviteOnlyFixture();
      await f.db.update(users).set({ status }).where(eq(users.id, f.targetUser.id));
      await removeStaffMembership(f.context, f.target.id, f.actor);
      expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    });
  }

  for (const evidence of ["accepted invitation", "password", "missing invitation", "other restaurant activity", "reset token"] as const) {
    test(`keeps an invited account with ${evidence}`, async () => {
      const f = await inviteOnlyFixture();
      if (evidence === "accepted invitation") await f.db.update(staffInvitations).set({ acceptedAt: new Date() }).where(eq(staffInvitations.membershipId, f.target.id));
      if (evidence === "password") await f.db.update(users).set({ passwordHash: "previously-set-password" }).where(eq(users.id, f.targetUser.id));
      if (evidence === "missing invitation") await f.db.delete(staffInvitations).where(eq(staffInvitations.membershipId, f.target.id));
      if (evidence === "other restaurant activity") await f.db.insert(auditLogs).values({ organizationId: f.otherRestaurant.id, actorUserId: f.targetUser.id, action: "example.action", entityType: "example" });
      if (evidence === "reset token") await f.db.insert(passwordResetTokens).values({ userId: f.targetUser.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
      await removeStaffMembership(f.context, f.target.id, f.actor);
      expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
      const [audit] = await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.target.id));
      expect(audit.metadata).toMatchObject({ accountDeleted: false });
    });
  }

  test("keeps an invite account when another membership is being assigned concurrently", async () => {
    const f = await inviteOnlyFixture();
    let inserted!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { inserted = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const writer = f.db.transaction(async (tx) => {
      await tx.insert(memberships).values({ userId: f.targetUser.id, organizationId: f.otherRestaurant.id, role: "ORDER_OPERATOR" });
      inserted();
      await hold;
    });
    await ready;
    let settled = false;
    const removal = removeStaffMembership(f.context, f.target.id, f.actor).finally(() => { settled = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally {
      release();
    }
    await writer;
    await removal;
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.userId, f.targetUser.id))).toHaveLength(1);
  });

  test("an audit failure restores the invite account, membership and invitation", async () => {
    const f = await inviteOnlyFixture();
    await expect(removeStaffMembership(f.context, f.target.id, { ...f.actor, id: randomUUID() })).rejects.toThrow();
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
    expect(await f.db.select().from(staffInvitations).where(eq(staffInvitations.membershipId, f.target.id))).toHaveLength(1);
  });

  test("blocks scheduled shifts, including creator links", async () => {
    const f = await fixture();
    const [job] = await f.db.insert(restaurantJobs).values({ organizationId: f.restaurant.id, name: "Operator" }).returning();
    await f.db.insert(staffScheduledShifts).values({ organizationId: f.restaurant.id, membershipId: f.actor.membershipId, jobId: job.id, createdByMembershipId: f.target.id, startsAt: new Date("2026-11-18T10:00:00Z"), endsAt: new Date("2026-11-18T18:00:00Z") });
    await expectBlocked(f);
  });

  test("blocks cash history even when only the user ID is linked", async () => {
    const f = await fixture();
    const [point] = await f.db.insert(orderingPoints).values({ organizationId: f.restaurant.id, name: "Till", slug: `till-${randomUUID()}` }).returning();
    await f.db.insert(cashDrawerSessions).values({ organizationId: f.restaurant.id, orderingPointId: point.id, currency: "GBP", openedByUserId: f.targetUser.id });
    await expectBlocked(f);
  });

  test("blocks staff activity recorded in audit history", async () => {
    const f = await fixture();
    await f.db.insert(auditLogs).values({ organizationId: f.restaurant.id, actorUserId: f.targetUser.id, action: "example.action", entityType: "example" });
    await expectBlocked(f);
  });

  test("checks transfers scoped through source and destination restaurant columns", async () => {
    const f = await fixture();
    await f.db.insert(inventoryStockTransfers).values({ sourceOrganizationId: f.otherRestaurant.id, destinationOrganizationId: f.restaurant.id, transferNumber: 1, receivedByUserId: f.targetUser.id });
    await expectBlocked(f);
  });

  test("does not remove or block activity belonging only to another restaurant", async () => {
    const f = await fixture();
    await f.db.insert(auditLogs).values({ organizationId: f.otherRestaurant.id, actorUserId: f.targetUser.id, action: "example.action", entityType: "example" });
    expect((await removeStaffMembership(f.context, f.target.id, f.actor))?.id).toBe(f.target.id);
    expect(await f.db.select().from(auditLogs).where(and(eq(auditLogs.organizationId, f.otherRestaurant.id), eq(auditLogs.actorUserId, f.targetUser.id)))).toHaveLength(1);
  });

  test("cannot remove yourself or another tenant's membership", async () => {
    const f = await fixture();
    await expect(removeStaffMembership(f.context, f.actor.membershipId, f.actor)).rejects.toMatchObject({ status: 400 });
    expect(await removeStaffMembership({ ...f.context, organizationId: f.otherRestaurant.id }, f.target.id, f.actor)).toBeNull();
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
  });

  test("cannot remove the last active manager", async () => {
    const f = await fixture(true, false);
    await expect(removeStaffMembership(f.context, f.target.id, f.actor)).rejects.toMatchObject({ status: 409, message: "The last active restaurant manager cannot be removed." });
  });

  test("concurrent removal requests delete and audit only once", async () => {
    const f = await fixture();
    const results = await Promise.all([removeStaffMembership(f.context, f.target.id, f.actor), removeStaffMembership(f.context, f.target.id, f.actor)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await f.db.select().from(auditLogs).where(eq(auditLogs.entityId, f.target.id))).toHaveLength(1);
  });

  test("concurrent requests cannot remove both remaining managers", async () => {
    const f = await fixture(true);
    const results = await Promise.allSettled([
      removeStaffMembership(f.context, f.target.id, f.actor),
      removeStaffMembership(f.context, f.actor.membershipId, { id: f.targetUser.id, membershipId: f.target.id, role: f.target.role }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await f.db.select().from(memberships).where(eq(memberships.organizationId, f.restaurant.id))).toHaveLength(1);
  });

  test("waits for an in-flight linked record and refuses removal after it commits", async () => {
    const f = await fixture();
    let inserted!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { inserted = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const writer = f.db.transaction(async (tx) => {
      await tx.insert(staffPayrollProfiles).values({ organizationId: f.restaurant.id, membershipId: f.target.id, employeeReference: "CONCURRENT" });
      inserted();
      await hold;
    });
    await ready;
    let settled = false;
    const removal = removeStaffMembership(f.context, f.target.id, f.actor).catch((error) => error).finally(() => { settled = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally {
      release();
    }
    await writer;
    expect(await removal).toMatchObject({ status: 409, message: expect.stringContaining("linked records") });
  });

  test("an audit failure rolls back the removal", async () => {
    const f = await fixture();
    await expect(removeStaffMembership(f.context, f.target.id, { ...f.actor, id: randomUUID() })).rejects.toThrow();
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
  });

  test("API rejects unauthenticated callers and staff without staff.manage", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_STAFF_REMOVAL_APP_URL to the application running on the isolated test database.");
    const f = await fixture(false, false);
    expect((await request.delete(endpoint(f.target.id))).status()).toBe(401);
    await signIn(request, f);
    expect((await request.delete(endpoint(f.target.id))).status()).toBe(401);
    expect(await f.db.select().from(memberships).where(eq(memberships.id, f.target.id))).toHaveLength(1);
  });

  test("API rejects self-removal, cross-tenant IDs, malformed IDs and linked records", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_STAFF_REMOVAL_APP_URL to the application running on the isolated test database.");
    const f = await fixture();
    await signIn(request, f);
    expect((await request.delete(endpoint(f.actor.membershipId))).status()).toBe(400);
    expect((await request.delete(endpoint("not-a-uuid"))).status()).toBe(400);
    const [other] = await f.db.insert(memberships).values({ organizationId: f.otherRestaurant.id, userId: f.targetUser.id, role: "ORDER_OPERATOR" }).returning();
    expect((await request.delete(endpoint(other.id))).status()).toBe(404);
    await f.db.insert(staffPayrollProfiles).values({ organizationId: f.restaurant.id, membershipId: f.target.id, employeeReference: "LINKED" });
    const response = await request.delete(endpoint(f.target.id));
    expect(response.status()).toBe(409);
    expect((await response.json()).error).toContain("Deactivate");
  });

  test("API removes an unused member and preserves the account", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_STAFF_REMOVAL_APP_URL to the application running on the isolated test database.");
    const f = await fixture();
    await signIn(request, f);
    const response = await request.delete(endpoint(f.target.id));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ removedMembershipId: f.target.id });
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(1);
  });

  test("API removes a sole invitation-only account", async ({ request }) => {
    test.skip(!appUrl, "Set E2E_STAFF_REMOVAL_APP_URL to the application running on the isolated test database.");
    const f = await inviteOnlyFixture();
    await signIn(request, f);
    expect((await request.delete(endpoint(f.target.id))).status()).toBe(200);
    expect(await f.db.select().from(users).where(eq(users.id, f.targetUser.id))).toHaveLength(0);
    expect((await request.delete(endpoint(f.target.id))).status()).toBe(404);
  });

  test("removal invalidates an existing session for that membership", async ({ request, playwright }) => {
    test.skip(!appUrl, "Set E2E_STAFF_REMOVAL_APP_URL to the application running on the isolated test database.");
    const f = await fixture();
    const targetSession = await playwright.request.newContext();
    try {
      await signIn(targetSession, {
        ...f, actor: { id: f.targetUser.id, membershipId: f.target.id, username: f.targetUser.username, role: f.target.role },
      });
      await signIn(request, f);
      expect((await request.delete(endpoint(f.target.id))).status()).toBe(200);
      const session = await (await targetSession.get(new URL("/api/auth/session", appUrl!).toString())).json();
      expect(session?.user).toBeFalsy();
    } finally {
      await targetSession.dispose();
    }
  });
});
