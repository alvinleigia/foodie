import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";

function readLocalEnvironment() {
  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return values;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return values;
      const name = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[name] = value;
      return values;
    }, {});
}

function formatDateForTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const environment = readLocalEnvironment();
const isUatDeployment = (environment.DEPLOYMENT_CELL_ID ?? "")
  .toLowerCase()
  .includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const username = `leave-uat-${suffix}`;
const email = `${username}@example.invalid`;
const password = `Uat-${randomUUID()}!`;
const jobName = `UAT Leave Job ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT staff time off", () => {
  test.skip(
    !isUatDeployment || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let timezone = "";
  let userId = "";
  let membershipId = "";
  let jobId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [organization] = await sql<{ id: string; timezone: string }[]>`
      SELECT id, timezone
      FROM organizations
      WHERE slug = ${restaurantSlug}
        AND type = 'RESTAURANT'
        AND is_active = true
      LIMIT 1
    `;
    if (!organization) throw new Error(`UAT restaurant "${restaurantSlug}" was not found.`);
    organizationId = organization.id;
    timezone = organization.timezone;
    const passwordHash = await hashPassword(password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (
        username, name, email, password_hash, role, status, updated_at
      )
      VALUES (
        ${username}, 'Leave UAT', ${email}, ${passwordHash}, 'ADMIN', 'ACTIVE', now()
      )
      RETURNING id
    `;
    userId = user.id;
    const [membership] = await sql<{ id: string }[]>`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      )
      VALUES (
        ${userId}, ${organizationId}, 'RESTAURANT_MANAGER', '{}'::jsonb, true, now()
      )
      RETURNING id
    `;
    membershipId = membership.id;
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO restaurant_jobs (
        organization_id, name, permissions, is_active, updated_at
      )
      VALUES (
        ${organizationId},
        ${jobName},
        ${sql.json(["staff_schedule.view", "staff_schedule.manage"])},
        true,
        now()
      )
      RETURNING id
    `;
    jobId = job.id;
    await sql`
      INSERT INTO staff_job_assignments (
        organization_id, membership_id, job_id, is_primary, updated_at
      )
      VALUES (${organizationId}, ${membershipId}, ${jobId}, true, now())
    `;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    if (jobId) await sql`DELETE FROM restaurant_jobs WHERE id = ${jobId}`;
    await sql.end();
  });

  test("reviews leave and enforces schedule conflicts", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    const conflictDate = formatDateForTimezone(
      new Date(Date.now() + 7 * 24 * 60 * 60_000),
      timezone,
    );
    const existingShift = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId,
          jobId,
          startsAt: `${conflictDate}T09:00`,
          endsAt: `${conflictDate}T17:00`,
          breakMinutes: 30,
          note: "Leave approval conflict check.",
        },
      },
    );
    uatExpect(existingShift.status()).toBe(201);

    const conflictRequestResponse = await page.request.post(
      "/api/tenant/time-off",
      {
        data: {
          startsOn: conflictDate,
          endsOn: conflictDate,
          reason: "Existing shift conflict",
        },
      },
    );
    uatExpect(conflictRequestResponse.status()).toBe(201);
    const conflictRequests = (await conflictRequestResponse.json()) as Array<{
      id: string;
      reason: string | null;
    }>;
    const conflictRequestId = conflictRequests.find(
      (request) => request.reason === "Existing shift conflict",
    )?.id;
    uatExpect(conflictRequestId).toBeTruthy();
    const conflictingApproval = await page.request.patch(
      `/api/tenant/admin/time-off/${conflictRequestId}`,
      { data: { status: "APPROVED" } },
    );
    uatExpect(conflictingApproval.status()).toBe(409);
    uatExpect(
      (
        (await conflictingApproval.json()) as { error: string }
      ).error,
    ).toContain("overlapping published shift");
    uatExpect(
      (
        await page.request.patch(`/api/tenant/time-off/${conflictRequestId}`, {
          data: { status: "CANCELLED" },
        })
      ).status(),
    ).toBe(200);

    const leaveDate = formatDateForTimezone(
      new Date(Date.now() + 14 * 24 * 60 * 60_000),
      timezone,
    );
    const reason = `Approved leave ${suffix}`;
    const requestResponse = await page.request.post("/api/tenant/time-off", {
      data: { startsOn: leaveDate, endsOn: leaveDate, reason },
    });
    uatExpect(requestResponse.status()).toBe(201);
    const requests = (await requestResponse.json()) as Array<{
      id: string;
      reason: string | null;
    }>;
    const requestId = requests.find((request) => request.reason === reason)?.id;
    uatExpect(requestId).toBeTruthy();
    uatExpect(
      (
        await page.request.post("/api/tenant/time-off", {
          data: { startsOn: leaveDate, endsOn: leaveDate },
        })
      ).status(),
    ).toBe(409);
    uatExpect(
      (
        await page.request.patch(`/api/tenant/admin/time-off/${requestId}`, {
          data: { status: "APPROVED", reviewNote: "UAT approved" },
        })
      ).status(),
    ).toBe(200);

    const blockedShift = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId,
          jobId,
          startsAt: `${leaveDate}T09:00`,
          endsAt: `${leaveDate}T17:00`,
          breakMinutes: 30,
          note: "Approved leave safeguard.",
        },
      },
    );
    uatExpect(blockedShift.status()).toBe(409);
    uatExpect(
      ((await blockedShift.json()) as { error: string }).error,
    ).toContain("approved time off");
    uatExpect(
      (
        await page.request.patch(`/api/tenant/time-off/${requestId}`, {
          data: { status: "CANCELLED" },
        })
      ).status(),
    ).toBe(200);
    uatExpect(
      (
        await page.request.post("/api/tenant/admin/staff-schedule", {
          data: {
            membershipId,
            jobId,
            startsAt: `${leaveDate}T09:00`,
            endsAt: `${leaveDate}T17:00`,
            breakMinutes: 30,
            note: "Cancellation restored scheduling.",
          },
        })
      ).status(),
    ).toBe(201);

    const availabilityDate = formatDateForTimezone(
      new Date(Date.now() + 21 * 24 * 60 * 60_000),
      timezone,
    );
    const availableDay = new Date(`${availabilityDate}T00:00:00Z`).getUTCDay();
    const availabilityResponse = await page.request.put(
      "/api/tenant/availability",
      {
        data: {
          days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            isAvailable: dayOfWeek === availableDay,
            startsMinute: dayOfWeek === availableDay ? 600 : null,
            endsMinute: dayOfWeek === availableDay ? 960 : null,
          })),
        },
      },
    );
    uatExpect(availabilityResponse.status()).toBe(200);
    const outsideAvailability = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId,
          jobId,
          startsAt: `${availabilityDate}T09:00`,
          endsAt: `${availabilityDate}T17:00`,
          breakMinutes: 30,
          note: "Availability safeguard.",
        },
      },
    );
    uatExpect(outsideAvailability.status()).toBe(409);
    uatExpect(
      ((await outsideAvailability.json()) as { error: string }).error,
    ).toContain("outside the staff member's availability");
    const overrideReason = "Employee agreed to cover UAT shift";
    const availabilityOverride = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId,
          jobId,
          startsAt: `${availabilityDate}T09:00`,
          endsAt: `${availabilityDate}T17:00`,
          breakMinutes: 30,
          note: "Availability override.",
          availabilityOverrideReason: overrideReason,
        },
      },
    );
    uatExpect(availabilityOverride.status()).toBe(201);

    await page.goto(`/restaurants/${restaurantSlug}/schedule`);
    await uatExpect(page.getByRole("heading", { name: "Time off" })).toBeVisible();
    await uatExpect(
      page.getByRole("heading", { name: "Weekly availability" }),
    ).toBeVisible();
    await uatExpect(page.getByText(reason, { exact: true })).toBeVisible();
    await page.goto(`/restaurants/${restaurantSlug}/staff/schedule`);
    await uatExpect(
      page.getByRole("heading", { name: "Time-off requests" }),
    ).toBeVisible();
    await uatExpect(page.getByText(reason, { exact: true })).toBeVisible();
    await uatExpect(page.getByText(overrideReason, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Add shift" }).click();
    await page.getByLabel("Staff member").selectOption(membershipId);
    await uatExpect(page.getByText("Declared availability:")).toBeVisible();

    const [databaseResult] = await sql<{
      cancelled: number;
      availability_days: number;
      override_count: number;
    }[]>`
      SELECT
        (SELECT count(*) FILTER (WHERE status = 'CANCELLED')::int
         FROM staff_time_off_requests
         WHERE membership_id = ${membershipId}) AS cancelled,
        (SELECT count(*)::int
         FROM staff_weekly_availability
         WHERE membership_id = ${membershipId}) AS availability_days,
        (SELECT count(*)::int
         FROM staff_scheduled_shifts
         WHERE membership_id = ${membershipId}
           AND availability_override_reason = ${overrideReason}) AS override_count
    `;
    uatExpect(databaseResult.cancelled).toBe(2);
    uatExpect(databaseResult.availability_days).toBe(7);
    uatExpect(databaseResult.override_count).toBe(1);
  });
});
