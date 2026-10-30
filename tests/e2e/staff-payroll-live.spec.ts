import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "@/lib/passwords";
import type { StaffShiftRecord } from "@/types/staff-time-clock";

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

const environment = readEnvironment();
const isUat = (environment.DEPLOYMENT_CELL_ID ?? "").toLowerCase().includes("uat");
const restaurantSlug = process.env.E2E_WORKFORCE_RESTAURANT_SLUG ?? "snack-shack";
const suffix = randomUUID().slice(0, 8);
const password = `Uat-${randomUUID()}!`;
const managerUsername = `payroll-manager-uat-${suffix}`;
const employeeUsername = `payroll-employee-uat-${suffix}`;
const jobName = `UAT Payroll Job ${suffix}`;
const uatExpect = expect.configure({ timeout: 30_000 });

test.describe("live UAT staff payroll foundation", () => {
  test.skip(
    !isUat || !environment.DATABASE_URL,
    "This test only runs against a DATABASE_URL explicitly configured as UAT.",
  );

  let sql: ReturnType<typeof postgres>;
  let organizationId = "";
  let managerUserId = "";
  let employeeUserId = "";
  let employeeMembershipId = "";
  let jobId = "";

  test.beforeAll(async () => {
    sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
    const [organization] = await sql<{ id: string }[]>`
      SELECT id FROM organizations
      WHERE slug = ${restaurantSlug} AND type = 'RESTAURANT' AND is_active = true
      LIMIT 1
    `;
    if (!organization) throw new Error(`UAT restaurant "${restaurantSlug}" was not found.`);
    organizationId = organization.id;
    const passwordHash = await hashPassword(password);

    const [manager] = await sql<{ id: string }[]>`
      INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
      VALUES (
        ${managerUsername}, 'Payroll Manager UAT', ${`${managerUsername}@example.invalid`},
        ${passwordHash}, 'ADMIN', 'ACTIVE', now()
      ) RETURNING id
    `;
    managerUserId = manager.id;
    await sql`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      ) VALUES (
        ${managerUserId}, ${organizationId}, 'RESTAURANT_MANAGER', '{}'::jsonb, true, now()
      )
    `;

    const [employee] = await sql<{ id: string }[]>`
      INSERT INTO users (username, name, email, password_hash, role, status, updated_at)
      VALUES (
        ${employeeUsername}, 'Payroll Employee UAT', ${`${employeeUsername}@example.invalid`},
        ${passwordHash}, 'STAFF', 'ACTIVE', now()
      ) RETURNING id
    `;
    employeeUserId = employee.id;
    const [membership] = await sql<{ id: string }[]>`
      INSERT INTO memberships (
        user_id, organization_id, role, permission_overrides, is_active, updated_at
      ) VALUES (
        ${employeeUserId}, ${organizationId}, 'ORDER_OPERATOR', '{}'::jsonb, true, now()
      ) RETURNING id
    `;
    employeeMembershipId = membership.id;

    const [job] = await sql<{ id: string }[]>`
      INSERT INTO restaurant_jobs (organization_id, name, permissions, is_active, updated_at)
      VALUES (
        ${organizationId}, ${jobName}, ${sql.json(["time_clock.use"])}, true, now()
      ) RETURNING id
    `;
    jobId = job.id;
    await sql`
      INSERT INTO staff_job_assignments (
        organization_id, membership_id, job_id, is_primary, updated_at
      ) VALUES (${organizationId}, ${employeeMembershipId}, ${jobId}, true, now())
    `;
  });

  test.afterAll(async () => {
    if (!sql) return;
    if (managerUserId) {
      await sql`
        DELETE FROM staff_payroll_export_runs
        WHERE organization_id = ${organizationId}
          AND generated_by_user_id = ${managerUserId}
      `;
    }
    for (const userId of [managerUserId, employeeUserId].filter(Boolean)) {
      await sql`DELETE FROM audit_logs WHERE actor_user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    if (jobId) await sql`DELETE FROM restaurant_jobs WHERE id = ${jobId}`;
    await sql.end();
  });

  test("keeps the clock-in rate after the assignment rate changes", async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    await page.goto("/staff/login");
    await page.getByLabel("Username").fill(managerUsername);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(page).toHaveURL(new RegExp(`/restaurants/${restaurantSlug}`));

    const initialRateResponse = await page.request.put(
      `/api/tenant/admin/staff/${employeeMembershipId}/jobs`,
      {
        data: {
          jobIds: [jobId],
          payRates: [{ jobId, hourlyRateMinor: 1250 }],
          payrollEmployeeReference: `EMP-${suffix}`,
          primaryJobId: jobId,
        },
      },
    );
    uatExpect(initialRateResponse.status()).toBe(200);

    const employeeContext = await browser.newContext({ baseURL });
    const employeePage = await employeeContext.newPage();
    await employeePage.goto("/staff/login");
    await employeePage.getByLabel("Username").fill(employeeUsername);
    await employeePage.getByLabel("Password").fill(password);
    await employeePage.getByRole("button", { name: /sign in/i }).click();
    await uatExpect(employeePage).toHaveURL(
      new RegExp(`/restaurants/${restaurantSlug}`),
    );

    const clockInResponse = await employeePage.request.post(
      "/api/tenant/time-clock",
      { data: { action: "CLOCK_IN", jobId } },
    );
    uatExpect(clockInResponse.status()).toBe(200);
    const [shift] = await sql<{ id: string }[]>`
      UPDATE staff_shifts
      SET clocked_in_at = now() - interval '120 minutes'
      WHERE organization_id = ${organizationId}
        AND membership_id = ${employeeMembershipId}
        AND clocked_out_at IS NULL
      RETURNING id
    `;
    uatExpect(shift?.id).toBeTruthy();

    const changedRateResponse = await page.request.put(
      `/api/tenant/admin/staff/${employeeMembershipId}/jobs`,
      {
        data: {
          jobIds: [jobId],
          payRates: [{ jobId, hourlyRateMinor: 1500 }],
          payrollEmployeeReference: `EMP-${suffix}`,
          primaryJobId: jobId,
        },
      },
    );
    uatExpect(changedRateResponse.status()).toBe(200);
    uatExpect(
      (
        await employeePage.request.post("/api/tenant/time-clock", {
          data: { action: "CLOCK_OUT" },
        })
      ).status(),
    ).toBe(200);

    const recordsResponse = await page.request.get(
      "/api/tenant/admin/staff-shifts?query=Payroll%20Employee%20UAT",
    );
    uatExpect(recordsResponse.status()).toBe(200);
    const records = (await recordsResponse.json()) as { shifts: StaffShiftRecord[] };
    const completedShift = records.shifts.find((record) => record.id === shift.id);
    uatExpect(completedShift?.hourlyRateMinor).toBe(1250);
    uatExpect(completedShift?.workedMinutes).toBe(120);
    uatExpect(completedShift?.grossPayMinor).toBe(2500);
    uatExpect(completedShift?.payCurrency).toBe("GBP");

    uatExpect(
      (
        await page.request.patch(`/api/tenant/admin/staff-shifts/${shift.id}`, {
          data: { approved: true },
        })
      ).status(),
    ).toBe(200);
    const exportResponse = await page.request.get(
      "/api/tenant/admin/staff-shifts/export?query=Payroll%20Employee%20UAT",
    );
    uatExpect(exportResponse.status()).toBe(200);
    const csv = await exportResponse.text();
    uatExpect(csv).toContain('"12.50","GBP","25.00"');
    const payrollResponse = await page.request.post(
      "/api/tenant/admin/staff-shifts/payroll-export",
      {
        data: {
          from: `${new Date().getUTCFullYear()}-01-01`,
          query: "Payroll Employee UAT",
          to: `${new Date().getUTCFullYear()}-12-31`,
        },
      },
    );
    uatExpect(payrollResponse.status()).toBe(201);
    const payrollResult = (await payrollResponse.json()) as {
      run: { id: string; rowCount: number; grossPayMinor: number };
    };
    uatExpect(payrollResult.run.rowCount).toBe(1);
    uatExpect(payrollResult.run.grossPayMinor).toBe(2500);
    const downloadResponse = await page.request.get(
      `/api/tenant/admin/staff-shifts/payroll-export/${payrollResult.run.id}`,
    );
    uatExpect(downloadResponse.status()).toBe(200);
    const payrollCsv = await downloadResponse.text();
    uatExpect(payrollCsv).toContain(`"EMP-${suffix}"`);
    uatExpect(payrollCsv).toContain('"12.50","GBP","25.00"');
    const duplicateResponse = await page.request.post(
      "/api/tenant/admin/staff-shifts/payroll-export",
      {
        data: {
          from: `${new Date().getUTCFullYear()}-01-01`,
          query: "Payroll Employee UAT",
          to: `${new Date().getUTCFullYear()}-12-31`,
        },
      },
    );
    uatExpect(duplicateResponse.status()).toBe(409);
    const [audit] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE organization_id = ${organizationId}
        AND actor_user_id = ${managerUserId}
        AND action = 'staff_payroll.export'
    `;
    uatExpect(audit.count).toBe(1);
    const [storedRun] = await sql<{ entries: number }[]>`
      SELECT count(e.id)::int AS entries
      FROM staff_payroll_export_runs r
      JOIN staff_payroll_export_entries e ON e.export_run_id = r.id
      WHERE r.id = ${payrollResult.run.id}
    `;
    uatExpect(storedRun.entries).toBe(1);
    await employeeContext.close();
  });
});
