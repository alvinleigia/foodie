import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import {
  staffTimesheetBulkApprovalSchema,
  staffTimesheetFiltersSchema,
} from "@/lib/validations/staff-timesheet";

test.describe("staff time clock", () => {
  test("stores tenant-scoped shifts and breaks with one open record", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0065_staff_time_clock.sql",
      "utf8",
    );

    expect(schemaSource).toContain("staffShifts");
    expect(schemaSource).toContain("staffShiftBreaks");
    expect(schemaSource).toContain("scheduledShiftId");
    expect(schemaSource).toContain(
      'name: "staff_shifts_membership_organization_fk"',
    );
    expect(schemaSource).toContain(
      'name: "staff_shifts_job_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_shifts_open_membership_unique"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_shift_breaks_open_shift_unique"',
    );
    expect(migrationSource).toContain('"job_name_snapshot" text NOT NULL');
  });

  test("allows only assigned active jobs at clock in", () => {
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");

    expect(serviceSource).toContain("staffJobAssignments");
    expect(serviceSource).toContain("eq(restaurantJobs.isActive, true)");
    expect(serviceSource).toContain(
      "Choose an active job assigned to you.",
    );
    expect(serviceSource).toContain("You are already clocked in.");
  });

  test("recognizes unique violations wrapped by the database client", () => {
    expect(
      hasPostgresErrorCode(
        { cause: { code: "23505", message: "duplicate key" } },
        "23505",
      ),
    ).toBe(true);
    expect(
      hasPostgresErrorCode({ cause: { code: "23503" } }, "23505"),
    ).toBe(false);
  });

  test("records breaks and closes an open break during clock out", () => {
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");

    expect(serviceSource).toContain("startStaffBreak");
    expect(serviceSource).toContain("endStaffBreak");
    expect(serviceSource).toContain("clockOutStaff");
    expect(serviceSource).toContain("endedOpenBreak");
    expect(serviceSource).toContain("workedMinutes");
  });

  test("protects personal and manager time clock routes", () => {
    const timeClockRoute = readFileSync(
      "app/api/tenant/time-clock/route.ts",
      "utf8",
    );
    const managerRoute = readFileSync(
      "app/api/tenant/admin/staff-shifts/route.ts",
      "utf8",
    );

    expect(timeClockRoute).toContain(
      'requireStaffPermission("time_clock.use")',
    );
    expect(managerRoute).toContain(
      'requireStaffPermission("time_clock.manage")',
    );
    expect(timeClockRoute).toContain("staffTimeClockActionSchema");
  });

  test("audits each time clock transition", () => {
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");

    expect(serviceSource).toContain('action: "staff_shift.clock_in"');
    expect(serviceSource).toContain('action: "staff_shift.break_start"');
    expect(serviceSource).toContain('action: "staff_shift.break_end"');
    expect(serviceSource).toContain('action: "staff_shift.clock_out"');
  });

  test("keeps employee shifts separate from till sessions", () => {
    const timeClockSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const cashDrawerSource = readFileSync(
      "lib/cash-drawer-sessions.ts",
      "utf8",
    );

    expect(timeClockSource).not.toContain("cashDrawerSessions");
    expect(cashDrawerSource).not.toContain("staffShifts");
  });

  test("publishes employee and manager workforce screens", () => {
    const employeePage = readFileSync(
      "app/restaurants/[restaurantSlug]/time-clock/page.tsx",
      "utf8",
    );
    const managerPage = readFileSync(
      "app/restaurants/[restaurantSlug]/staff/shifts/page.tsx",
      "utf8",
    );
    const employeePanel = readFileSync(
      "components/staff/StaffTimeClockPanel.tsx",
      "utf8",
    );
    const managerPanel = readFileSync(
      "components/admin/StaffShiftRecordsPanel.tsx",
      "utf8",
    );

    expect(employeePage).toContain('requiredPermission: "time_clock.use"');
    expect(managerPage).toContain('requiredPermission: "time_clock.manage"');
    expect(employeePanel).toContain("Start break");
    expect(employeePanel).toContain("Clock out");
    expect(employeePanel).toContain("Upcoming schedule");
    expect(managerPanel).toContain("Staff shift records");
  });

  test("approves completed timesheets and exports approved records", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0067_staff_timesheet_approvals.sql",
      "utf8",
    );
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const approvalRoute = readFileSync(
      "app/api/tenant/admin/staff-shifts/[shiftId]/route.ts",
      "utf8",
    );
    const exportRoute = readFileSync(
      "app/api/tenant/admin/staff-shifts/export/route.ts",
      "utf8",
    );

    expect(schemaSource).toContain("approvalStatus");
    expect(migrationSource).toContain(
      'CONSTRAINT "staff_shifts_approval_metadata_check"',
    );
    expect(serviceSource).toContain("Clock out before approving this timesheet.");
    expect(serviceSource).toContain('action: input.approved');
    expect(serviceSource).toContain("approvedStaffShiftsToCsv");
    expect(approvalRoute).toContain(
      'requireStaffPermission("time_clock.manage")',
    );
    expect(exportRoute).toContain(
      'filename="approved-timesheets.csv"',
    );
  });

  test("filters and bulk-approves manager timesheet reviews", () => {
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const bulkRoute = readFileSync(
      "app/api/tenant/admin/staff-shifts/bulk/route.ts",
      "utf8",
    );
    const managerPanel = readFileSync(
      "components/admin/StaffShiftRecordsPanel.tsx",
      "utf8",
    );

    expect(
      staffTimesheetFiltersSchema.safeParse({
        from: "2026-10-01",
        status: "PENDING",
        to: "2026-10-31",
      }).success,
    ).toBe(true);
    expect(
      staffTimesheetFiltersSchema.safeParse({
        from: "2026-11-01",
        to: "2026-10-01",
      }).success,
    ).toBe(false);
    expect(
      staffTimesheetBulkApprovalSchema.safeParse({
        approved: true,
        shiftIds: ["e3d22969-f961-43fe-90d2-d6d10e7feb8a"],
      }).success,
    ).toBe(true);
    expect(serviceSource).toContain("setStaffShiftApprovals");
    expect(serviceSource).toContain("timesheet_bulk_approve");
    expect(bulkRoute).toContain(
      'requireStaffPermission("time_clock.manage")',
    );
    expect(managerPanel).toContain("Select pending");
    expect(managerPanel).toContain("Approve selected");
  });
});
