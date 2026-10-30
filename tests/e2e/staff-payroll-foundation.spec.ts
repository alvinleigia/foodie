import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { staffJobAssignmentSchema } from "@/lib/validations/staff-job";
import { staffPayrollExportSchema } from "@/lib/validations/staff-timesheet";

const jobId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";

test.describe("staff payroll foundation", () => {
  test("validates optional hourly rates for assigned jobs", () => {
    expect(
      staffJobAssignmentSchema.safeParse({
        jobIds: [jobId],
        payRates: [{ jobId, hourlyRateMinor: 1250 }],
        primaryJobId: jobId,
      }).success,
    ).toBe(true);
    expect(
      staffJobAssignmentSchema.safeParse({
        jobIds: [],
        payRates: [{ jobId, hourlyRateMinor: 1250 }],
        primaryJobId: null,
      }).success,
    ).toBe(false);
    expect(
      staffJobAssignmentSchema.safeParse({
        jobIds: [jobId],
        payRates: [{ jobId, hourlyRateMinor: -1 }],
        primaryJobId: jobId,
      }).success,
    ).toBe(false);
  });

  test("stores tenant-scoped rates and immutable shift snapshots", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0071_staff_pay_rates.sql",
      "utf8",
    );
    const jobServiceSource = readFileSync("lib/staff-jobs.ts", "utf8");
    const timeClockSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const payrollSource = readFileSync("lib/staff-payroll.ts", "utf8");

    expect(schemaSource).toContain("hourlyRateMinor");
    expect(schemaSource).toContain("hourlyRateMinorSnapshot");
    expect(schemaSource).toContain("payCurrencySnapshot");
    expect(migrationSource).toContain(
      'CONSTRAINT "staff_shifts_pay_snapshot_check"',
    );
    expect(jobServiceSource).toContain("rateByJobId");
    expect(timeClockSource).toContain(
      "hourlyRateMinorSnapshot: job.hourlyRateMinor",
    );
    expect(timeClockSource).toContain(
      "Math.round((shift.hourlyRateMinor * workedMinutes) / 60)",
    );
    expect(schemaSource).toContain("staffPayrollProfiles");
    expect(payrollSource).toContain("createGenericPayrollExport");
    expect(payrollSource).toContain("Add a payroll employee reference for:");
  });

  test("includes payroll-ready values in approved exports", () => {
    const timeClockSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const assignmentFormSource = readFileSync(
      "components/admin/StaffJobAssignmentForm.tsx",
      "utf8",
    );
    const payrollRouteSource = readFileSync(
      "app/api/tenant/admin/staff-shifts/payroll-export/route.ts",
      "utf8",
    );

    expect(timeClockSource).toContain('"hourly_rate"');
    expect(timeClockSource).toContain('"gross_pay"');
    expect(timeClockSource).toContain('"currency"');
    expect(assignmentFormSource).toContain("Hourly pay");
    expect(assignmentFormSource).toContain("Payroll employee reference");
    expect(assignmentFormSource).toContain("later rate changes do not alter past records");
    expect(payrollRouteSource).toContain('action: "staff_payroll.export"');
    expect(payrollRouteSource).toContain(
      'requireStaffPermission("time_clock.manage")',
    );
  });

  test("requires a bounded period and protects shifts from duplicate exports", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0073_staff_payroll_export_runs.sql",
      "utf8",
    );
    const payrollSource = readFileSync("lib/staff-payroll.ts", "utf8");
    const managerPanelSource = readFileSync(
      "components/admin/StaffShiftRecordsPanel.tsx",
      "utf8",
    );

    expect(
      staffPayrollExportSchema.safeParse({
        from: "2026-10-01",
        to: "2026-10-31",
      }).success,
    ).toBe(true);
    expect(staffPayrollExportSchema.safeParse({}).success).toBe(false);
    expect(
      staffPayrollExportSchema.safeParse({
        from: "2026-11-01",
        to: "2026-10-01",
      }).success,
    ).toBe(false);
    expect(schemaSource).toContain("staffPayrollExportRuns");
    expect(schemaSource).toContain("staffPayrollExportEntries");
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_payroll_export_entries_shift_unique"',
    );
    expect(payrollSource).toContain("createStaffPayrollExportRun");
    expect(payrollSource).toContain("already included in a payroll export");
    expect(managerPanelSource).toContain("Payroll export history");
  });
});
