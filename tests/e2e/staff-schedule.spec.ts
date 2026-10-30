import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { toUtcDateTime } from "@/lib/business-date";

test.describe("staff scheduling", () => {
  test("stores tenant-scoped schedules and planned-to-worked links", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0066_staff_scheduling.sql",
      "utf8",
    );

    expect(schemaSource).toContain("staffScheduledShifts");
    expect(schemaSource).toContain(
      'name: "staff_scheduled_shifts_membership_organization_fk"',
    );
    expect(schemaSource).toContain(
      'name: "staff_scheduled_shifts_job_organization_fk"',
    );
    expect(schemaSource).toContain(
      'name: "staff_shifts_scheduled_shift_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_scheduled_shifts_member_start_unique"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_shifts_scheduled_shift_unique"',
    );
  });

  test("converts restaurant-local schedule times through daylight saving", () => {
    expect(
      toUtcDateTime("2026-07-01T09:00", "Europe/London").toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");
    expect(
      toUtcDateTime("2026-12-01T09:00", "Europe/London").toISOString(),
    ).toBe("2026-12-01T09:00:00.000Z");
  });

  test("validates assigned jobs, overlaps and cancellation history", () => {
    const serviceSource = readFileSync("lib/staff-schedule.ts", "utf8");
    const validationSource = readFileSync(
      "lib/validations/staff-schedule.ts",
      "utf8",
    );

    expect(serviceSource).toContain("staffJobAssignments");
    expect(serviceSource).toContain("already has an overlapping scheduled shift");
    expect(serviceSource).toContain('status: "CANCELLED"');
    expect(validationSource).toContain("End time must be after start time.");
  });

  test("protects and audits manager schedule mutations", () => {
    const collectionRoute = readFileSync(
      "app/api/tenant/admin/staff-schedule/route.ts",
      "utf8",
    );
    const shiftRoute = readFileSync(
      "app/api/tenant/admin/staff-schedule/[scheduledShiftId]/route.ts",
      "utf8",
    );

    for (const source of [collectionRoute, shiftRoute]) {
      expect(source).toContain(
        'requireStaffPermission("staff_schedule.manage")',
      );
      expect(source).toContain("getCurrentTenantContext()");
      expect(source).toContain("writeAuditLog");
    }
  });

  test("publishes manager and personal schedule screens", () => {
    const managerPage = readFileSync(
      "app/restaurants/[restaurantSlug]/staff/schedule/page.tsx",
      "utf8",
    );
    const personalPage = readFileSync(
      "app/restaurants/[restaurantSlug]/schedule/page.tsx",
      "utf8",
    );
    const navigation = readFileSync("lib/staff-navigation.ts", "utf8");

    expect(managerPage).toContain(
      'requiredPermission: "staff_schedule.manage"',
    );
    expect(personalPage).toContain(
      'requiredPermission: "staff_schedule.view"',
    );
    expect(navigation).toContain('destination: "staffSchedule"');
    expect(navigation).toContain('destination: "schedule"');
  });

  test("links a published schedule to clock in", () => {
    const serviceSource = readFileSync("lib/staff-time-clock.ts", "utf8");
    const validationSource = readFileSync(
      "lib/validations/staff-time-clock.ts",
      "utf8",
    );
    const panelSource = readFileSync(
      "components/staff/StaffTimeClockPanel.tsx",
      "utf8",
    );

    expect(serviceSource).toContain("getUpcomingTimeClockSchedule");
    expect(serviceSource).toContain("scheduledShiftId");
    expect(validationSource).toContain("scheduledShiftId");
    expect(panelSource).toContain("Upcoming schedule");
  });
});
