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

      if (!trimmed || trimmed.startsWith("#")) {
        return values;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return values;
      }

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

const localEnvironment = readLocalEnvironment();
const deploymentCell = localEnvironment.DEPLOYMENT_CELL_ID ?? "";
const isUatDeployment = deploymentCell.toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const uniqueSuffix = randomUUID().slice(0, 8);
const username = `workforce-uat-${uniqueSuffix}`;
const email = `${username}@example.invalid`;
const password = `Uat-${randomUUID()}!`;
const jobName = `UAT Shift Manager ${uniqueSuffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

function formatForTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

test.describe("live UAT workforce workflow", () => {
  test.skip(
    !isUatDeployment || !localEnvironment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );
  test.describe.configure({ mode: "serial" });

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let organizationTimezone = "";
  let userId = "";
  let membershipId = "";

  test.beforeAll(async () => {
    sql = postgres(localEnvironment.DATABASE_URL, {
      max: 1,
      prepare: false,
    });
    const [organization] = await sql<{ id: string; timezone: string }[]>`
      SELECT id, timezone
      FROM organizations
      WHERE slug = ${restaurantSlug}
        AND type = 'RESTAURANT'
        AND is_active = true
      LIMIT 1
    `;

    if (!organization) {
      throw new Error(`Active UAT restaurant "${restaurantSlug}" was not found.`);
    }

    organizationId = organization.id;
    organizationTimezone = organization.timezone;
    const passwordHash = await hashPassword(password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (
        username,
        name,
        email,
        password_hash,
        role,
        status,
        updated_at
      )
      VALUES (
        ${username},
        'Workforce UAT',
        ${email},
        ${passwordHash},
        'ADMIN',
        'ACTIVE',
        now()
      )
      RETURNING id
    `;
    userId = user.id;
    const [membership] = await sql<{ id: string }[]>`
      INSERT INTO memberships (
        user_id,
        organization_id,
        role,
        permission_overrides,
        is_active,
        updated_at
      )
      VALUES (
        ${userId},
        ${organizationId},
        'RESTAURANT_MANAGER',
        '{}'::jsonb,
        true,
        now()
      )
      RETURNING id
    `;
    membershipId = membership.id;
  });

  test.afterAll(async () => {
    if (!sql) {
      return;
    }

    if (userId) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }

    if (organizationId) {
      await sql`
        DELETE FROM restaurant_jobs
        WHERE organization_id = ${organizationId}
          AND name = ${jobName}
      `;
    }

    await sql.end();
  });

  test("creates, assigns and uses a staff job through a complete shift", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(
      new RegExp(`/restaurants/${restaurantSlug}`),
    );

    await page.goto(`/restaurants/${restaurantSlug}/staff/jobs`);
    await uatExpect(
      page.getByRole("heading", { name: "Staff jobs" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add job" }).click();
    await page.getByLabel("Job name").fill(jobName);
    await page
      .getByLabel("Description (optional)")
      .fill("Temporary job created by the workforce UAT test.");

    for (const permissionName of [
      /^Manage staff Invite staff/i,
      /^Use time clock /i,
      /^View staff shifts /i,
      /^View own schedule /i,
      /^Manage staff schedule /i,
    ]) {
      await page
        .getByRole("checkbox", { name: permissionName })
        .check();
    }

    await page.getByRole("button", { name: "Save job" }).click();
    await uatExpect(
      page.getByRole("paragraph").filter({ hasText: jobName }),
    ).toBeVisible();

    await page.goto(
      `/restaurants/${restaurantSlug}/staff/${membershipId}`,
    );
    const jobAssignment = page.locator("label").filter({ hasText: jobName });
    await jobAssignment.getByRole("checkbox").check();
    await page
      .getByRole("radio", { name: "Primary permission baseline" })
      .check();
    await page.getByRole("button", { name: "Save jobs" }).click();
    await uatExpect(page.getByText("Staff jobs updated.")).toBeVisible();

    const startsAt = formatForTimezone(
      new Date(Date.now() - 15 * 60_000),
      organizationTimezone,
    );
    const endsAt = formatForTimezone(
      new Date(Date.now() + 8 * 60 * 60_000),
      organizationTimezone,
    );

    await page.goto(`/restaurants/${restaurantSlug}/staff/schedule`);
    await uatExpect(
      page.getByRole("heading", { name: "Staff schedule" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add shift" }).click();
    await page.getByLabel("Staff member").selectOption(membershipId);
    await page.getByLabel("Job").selectOption({ label: `${jobName} (Primary)` });
    await page.getByLabel("Starts").fill(startsAt);
    await page.getByLabel("Ends").fill(endsAt);
    await page.getByLabel("Unpaid break (minutes)").fill("30");
    await page.getByLabel("Note (optional)").fill("Authenticated UAT schedule.");
    await page.getByRole("button", { name: "Save shift" }).click();
    await uatExpect(
      page.getByRole("paragraph").filter({ hasText: jobName }),
    ).toBeVisible();

    const [scheduledShift] = await sql<{ job_id: string }[]>`
      SELECT job_id
      FROM staff_scheduled_shifts
      WHERE membership_id = ${membershipId}
        AND status = 'PUBLISHED'
      LIMIT 1
    `;
    const overlappingShift = await page.request.post(
      "/api/tenant/admin/staff-schedule",
      {
        data: {
          membershipId,
          jobId: scheduledShift.job_id,
          startsAt,
          endsAt,
          breakMinutes: 0,
          note: "Overlap safeguard check.",
        },
      },
    );
    uatExpect(overlappingShift.status()).toBe(409);

    await page.goto(`/restaurants/${restaurantSlug}/schedule`);
    await uatExpect(page.getByText(jobName, { exact: true })).toBeVisible();

    await page.goto(`/restaurants/${restaurantSlug}/time-clock`);
    await uatExpect(
      page.getByRole("heading", { name: "Start shift" }),
    ).toBeVisible();
    const jobOption = page
      .getByLabel("Job")
      .locator("option")
      .filter({ hasText: jobName });
    const jobId = await jobOption.getAttribute("value");
    uatExpect(jobId).toBeTruthy();
    await page
      .getByRole("button", { name: new RegExp(jobName) })
      .click();
    await page.getByRole("button", { name: "Clock in" }).click();
    await uatExpect(
      page.getByText("Clocked in", { exact: true }),
    ).toBeVisible();

    const duplicateClockIn = await page.request.post("/api/tenant/time-clock", {
      data: {
        action: "CLOCK_IN",
        jobId,
      },
    });
    uatExpect(duplicateClockIn.status()).toBe(409);

    await page.getByRole("button", { name: "Start break" }).click();
    await uatExpect(page.getByText("On break", { exact: true })).toBeVisible();
    const duplicateBreak = await page.request.post("/api/tenant/time-clock", {
      data: { action: "START_BREAK" },
    });
    uatExpect(duplicateBreak.status()).toBe(409);

    await page.getByRole("button", { name: "End break" }).click();
    await uatExpect(
      page.getByRole("button", { name: "Start break" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clock out" }).click();
    await uatExpect(
      page.getByRole("heading", { name: "Start shift" }),
    ).toBeVisible();
    await uatExpect(page.getByText(jobName, { exact: true })).toBeVisible();

    await page.goto(`/restaurants/${restaurantSlug}/staff/shifts`);
    await uatExpect(
      page.getByRole("heading", { name: "Staff shift records" }),
    ).toBeVisible();
    await uatExpect(
      page.getByRole("paragraph").filter({ hasText: /^Workforce UAT$/ }),
    ).toBeVisible();
    await uatExpect(page.getByText(jobName, { exact: true })).toBeVisible();
    await page.getByLabel("Search staff or job").fill(jobName);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await uatExpect(page.getByText(jobName, { exact: true })).toBeVisible();
    await page
      .getByRole("checkbox", { name: new RegExp(jobName) })
      .check();
    await page
      .getByRole("button", { name: "Approve selected", exact: true })
      .click();
    await uatExpect(
      page.getByRole("button", { name: "Reopen", exact: true }),
    ).toBeVisible();

    const exportResponse = await page.request.get(
      `/api/tenant/admin/staff-shifts/export?query=${encodeURIComponent(jobName)}`,
    );
    uatExpect(exportResponse.status()).toBe(200);
    uatExpect(await exportResponse.text()).toContain(jobName);
    const approvedFilterResponse = await page.request.get(
      `/api/tenant/admin/staff-shifts?status=APPROVED&query=${encodeURIComponent(jobName)}`,
    );
    uatExpect(approvedFilterResponse.status()).toBe(200);
    const approvedFilterPayload = (await approvedFilterResponse.json()) as {
      shifts: Array<{ jobName: string }>;
    };
    uatExpect(approvedFilterPayload.shifts).toHaveLength(1);
    uatExpect(approvedFilterPayload.shifts[0]?.jobName).toBe(jobName);

    const [databaseResult] = await sql<{
      approval_status: string;
      organization_id: string;
      scheduled_shift_id: string | null;
      shift_count: number;
    }[]>`
      SELECT
        organization_id,
        max(scheduled_shift_id::text) AS scheduled_shift_id,
        max(approval_status) AS approval_status,
        count(*)::int AS shift_count
      FROM staff_shifts
      WHERE membership_id = ${membershipId}
      GROUP BY organization_id
    `;

    uatExpect(databaseResult.organization_id).toBe(organizationId);
    uatExpect(databaseResult.scheduled_shift_id).toBeTruthy();
    uatExpect(databaseResult.approval_status).toBe("APPROVED");
    uatExpect(databaseResult.shift_count).toBe(1);
  });
});
