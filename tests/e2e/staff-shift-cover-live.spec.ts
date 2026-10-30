import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";

function readEnvironment() {
  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return values;
      const separator = trimmed.indexOf("=");
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) value = value.slice(1, -1);
      values[trimmed.slice(0, separator).trim()] = value;
      return values;
    }, {});
}

function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const environment = readEnvironment();
const isUat = (environment.DEPLOYMENT_CELL_ID ?? "").toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const password = `Uat-${randomUUID()}!`;
const managerUsername = `cover-manager-uat-${suffix}`;
const volunteerUsername = `cover-volunteer-uat-${suffix}`;
const jobName = `UAT Cover Job ${suffix}`;
const openShiftNote = `Open shift UAT ${suffix}`;
const assignedShiftNote = `Assigned cover UAT ${suffix}`;
const cancelledShiftNote = `Cancelled open shift UAT ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT open shifts and cover", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let timezone = "";
  let jobId = "";
  let managerUserId = "";
  let managerMembershipId = "";
  let volunteerUserId = "";
  let volunteerMembershipId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [organization] = await sql<{ id: string; timezone: string }[]>`
      SELECT id, timezone FROM organizations
      WHERE slug = ${restaurantSlug} AND type = 'RESTAURANT' AND is_active = true
      LIMIT 1
    `;
    if (!organization) throw new Error(`UAT restaurant "${restaurantSlug}" was not found.`);
    organizationId = organization.id;
    timezone = organization.timezone;
    const passwordHash = await hashPassword(password);

    const [manager] = await sql<{ id: string }[]>`
      INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
      VALUES (
        ${managerUsername}, 'Cover Manager UAT', ${`${managerUsername}@example.invalid`},
        ${passwordHash}, 'ADMIN', 'ACTIVE', now()
      ) RETURNING id
    `;
    managerUserId = manager.id;
    const [managerMembership] = await sql<{ id: string }[]>`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      ) VALUES (
        ${managerUserId}, ${organizationId}, 'RESTAURANT_MANAGER', '{}'::jsonb, true, now()
      ) RETURNING id
    `;
    managerMembershipId = managerMembership.id;

    const [volunteer] = await sql<{ id: string }[]>`
      INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
      VALUES (
        ${volunteerUsername}, 'Cover Volunteer UAT', ${`${volunteerUsername}@example.invalid`},
        ${passwordHash}, 'STAFF', 'ACTIVE', now()
      ) RETURNING id
    `;
    volunteerUserId = volunteer.id;
    const [volunteerMembership] = await sql<{ id: string }[]>`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      ) VALUES (
        ${volunteerUserId}, ${organizationId}, 'ORDER_OPERATOR', '{}'::jsonb, true, now()
      ) RETURNING id
    `;
    volunteerMembershipId = volunteerMembership.id;

    const [job] = await sql<{ id: string }[]>`
      INSERT INTO restaurant_jobs (organization_id, name, permissions, is_active, updated_at)
      VALUES (
        ${organizationId}, ${jobName},
        ${sql.json(["staff_schedule.view", "staff_schedule.manage"])}, true, now()
      ) RETURNING id
    `;
    jobId = job.id;
    await sql`
      INSERT INTO staff_job_assignments (
        organization_id, membership_id, job_id, is_primary, updated_at
      ) VALUES
        (${organizationId}, ${managerMembershipId}, ${jobId}, true, now()),
        (${organizationId}, ${volunteerMembershipId}, ${jobId}, true, now())
    `;
  });

  test.afterAll(async () => {
    if (!sql) return;
    const membershipIds = [managerMembershipId, volunteerMembershipId].filter(Boolean);
    if (membershipIds.length > 0) {
      await sql`
        DELETE FROM staff_scheduled_shifts
        WHERE organization_id = ${organizationId}
          AND (
            created_by_membership_id IN ${sql(membershipIds)}
            OR membership_id IN ${sql(membershipIds)}
          )
      `;
    }
    for (const userId of [managerUserId, volunteerUserId].filter(Boolean)) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    if (jobId) await sql`DELETE FROM restaurant_jobs WHERE id = ${jobId}`;
    await sql.end();
  });

  test("publishes, claims and reassigns shifts", async ({ browser, page, baseURL }) => {
    test.setTimeout(360_000);
    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(managerUsername);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    const volunteerContext = await browser.newContext({ baseURL });
    const volunteerPage = await volunteerContext.newPage();
    await volunteerPage.goto("/staff/login");
    await volunteerPage.getByLabel("Username").fill(volunteerUsername);
    await volunteerPage.getByLabel("Password").fill(password);
    await volunteerPage.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(volunteerPage).toHaveURL(
      new RegExp(`/restaurants/${restaurantSlug}`),
    );

    const openDate = localDate(new Date(Date.now() + 28 * 24 * 60 * 60_000), timezone);
    const openResponse = await page.request.post("/api/tenant/admin/staff-schedule", {
      data: {
        membershipId: null,
        jobId,
        startsAt: `${openDate}T10:00`,
        endsAt: `${openDate}T16:00`,
        breakMinutes: 30,
        note: openShiftNote,
      },
    });
    uatExpect(openResponse.status()).toBe(201);
    const openConfiguration = (await openResponse.json()) as {
      shifts: Array<{ id: string; note: string | null }>;
    };
    const openShiftId = openConfiguration.shifts.find(
      (shift) => shift.note === openShiftNote,
    )?.id;
    uatExpect(openShiftId).toBeTruthy();
    const [openRequest] = await sql<{ id: string }[]>`
      SELECT id FROM staff_shift_cover_requests
      WHERE scheduled_shift_id = ${openShiftId ?? ""} AND status = 'OPEN'
      LIMIT 1
    `;
    uatExpect(openRequest?.id).toBeTruthy();

    const claimResponse = await volunteerPage.request.post(
      "/api/tenant/shift-cover",
      { data: { action: "CLAIM", requestId: openRequest.id, note: "Available to help" } },
    );
    uatExpect(claimResponse.status()).toBe(201);
    const [openClaim] = await sql<{ id: string }[]>`
      SELECT id FROM staff_shift_cover_claims
      WHERE request_id = ${openRequest.id} AND membership_id = ${volunteerMembershipId}
      LIMIT 1
    `;
    uatExpect(openClaim?.id).toBeTruthy();
    uatExpect(
      (
        await page.request.patch(`/api/tenant/admin/shift-cover/${openRequest.id}`, {
          data: { claimId: openClaim.id, status: "APPROVED" },
        })
      ).status(),
    ).toBe(200);

    const coverDate = localDate(new Date(Date.now() + 35 * 24 * 60 * 60_000), timezone);
    const assignedResponse = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId: managerMembershipId,
          jobId,
          startsAt: `${coverDate}T10:00`,
          endsAt: `${coverDate}T16:00`,
          breakMinutes: 30,
          note: assignedShiftNote,
        },
      },
    );
    uatExpect(assignedResponse.status()).toBe(201);
    const assignedConfiguration = (await assignedResponse.json()) as {
      shifts: Array<{ id: string; note: string | null }>;
    };
    const assignedShiftId = assignedConfiguration.shifts.find(
      (shift) => shift.note === assignedShiftNote,
    )?.id;
    uatExpect(assignedShiftId).toBeTruthy();
    const requestResponse = await page.request.post("/api/tenant/shift-cover", {
      data: {
        action: "REQUEST",
        scheduledShiftId: assignedShiftId,
        reason: "Need shift cover",
      },
    });
    uatExpect(requestResponse.status()).toBe(201);
    const [coverRequest] = await sql<{ id: string }[]>`
      SELECT id FROM staff_shift_cover_requests
      WHERE scheduled_shift_id = ${assignedShiftId ?? ""} AND status = 'OPEN'
      LIMIT 1
    `;
    uatExpect(
      (
        await page.request.post("/api/tenant/shift-cover", {
          data: { action: "CLAIM", requestId: coverRequest.id },
        })
      ).status(),
    ).toBe(409);
    uatExpect(
      (
        await volunteerPage.request.post("/api/tenant/shift-cover", {
          data: { action: "CLAIM", requestId: coverRequest.id },
        })
      ).status(),
    ).toBe(201);
    const [coverClaim] = await sql<{ id: string }[]>`
      SELECT id FROM staff_shift_cover_claims
      WHERE request_id = ${coverRequest.id} AND membership_id = ${volunteerMembershipId}
      LIMIT 1
    `;
    uatExpect(
      (
        await page.request.patch(`/api/tenant/admin/shift-cover/${coverRequest.id}`, {
          data: { claimId: coverClaim.id, status: "APPROVED" },
        })
      ).status(),
    ).toBe(200);

    const cancelDate = localDate(new Date(Date.now() + 42 * 24 * 60 * 60_000), timezone);
    const cancelResponse = await page.request.post("/api/tenant/admin/staff-schedule", {
      data: {
        membershipId: null,
        jobId,
        startsAt: `${cancelDate}T10:00`,
        endsAt: `${cancelDate}T16:00`,
        breakMinutes: 0,
        note: cancelledShiftNote,
      },
    });
    uatExpect(cancelResponse.status()).toBe(201);
    const cancelConfiguration = (await cancelResponse.json()) as {
      shifts: Array<{ id: string; note: string | null }>;
    };
    const cancelledShiftId = cancelConfiguration.shifts.find(
      (shift) => shift.note === cancelledShiftNote,
    )?.id;
    uatExpect(cancelledShiftId).toBeTruthy();
    uatExpect(
      (
        await page.request.patch(
          `/api/tenant/admin/staff-schedule/${cancelledShiftId}`,
          { data: { status: "CANCELLED" } },
        )
      ).status(),
    ).toBe(200);

    await volunteerPage.goto(`/restaurants/${restaurantSlug}/schedule`);
    await uatExpect(
      volunteerPage.getByRole("heading", { name: "Shift cover" }),
    ).toBeVisible();
    await uatExpect(volunteerPage.getByText(assignedShiftNote)).toBeVisible();
    await page.goto(`/restaurants/${restaurantSlug}/staff/schedule`);
    await uatExpect(
      page.getByRole("heading", { name: "Open shifts and cover" }),
    ).toBeVisible();

    const [result] = await sql<{
      cancelled_requests: number;
      filled_requests: number;
      reassigned_shifts: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM staff_shift_cover_requests
         WHERE organization_id = ${organizationId} AND status = 'CANCELLED'
           AND scheduled_shift_id IN (
             SELECT id FROM staff_scheduled_shifts WHERE note = ${cancelledShiftNote}
           )) AS cancelled_requests,
        (SELECT count(*)::int FROM staff_shift_cover_requests
         WHERE organization_id = ${organizationId} AND status = 'FILLED'
           AND scheduled_shift_id IN (
             SELECT id FROM staff_scheduled_shifts
             WHERE note IN (${openShiftNote}, ${assignedShiftNote})
           )) AS filled_requests,
        (SELECT count(*)::int FROM staff_scheduled_shifts
         WHERE organization_id = ${organizationId}
           AND membership_id = ${volunteerMembershipId}
           AND note IN (${openShiftNote}, ${assignedShiftNote})) AS reassigned_shifts
    `;
    uatExpect(result.cancelled_requests).toBe(1);
    uatExpect(result.filled_requests).toBe(2);
    uatExpect(result.reassigned_shifts).toBe(2);
    await volunteerContext.close();
  });
});
