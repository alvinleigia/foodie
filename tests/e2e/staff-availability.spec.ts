import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { staffWeeklyAvailabilitySchema } from "@/lib/validations/staff-schedule";

const weekdays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isAvailable: dayOfWeek >= 1 && dayOfWeek <= 5,
  startsMinute: dayOfWeek >= 1 && dayOfWeek <= 5 ? 540 : null,
  endsMinute: dayOfWeek >= 1 && dayOfWeek <= 5 ? 1020 : null,
}));

test.describe("staff weekly availability", () => {
  test("stores a tenant-scoped seven-day pattern and shift override reason", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0069_staff_weekly_availability.sql",
      "utf8",
    );

    expect(schemaSource).toContain("staffWeeklyAvailability");
    expect(schemaSource).toContain(
      'name: "staff_weekly_availability_membership_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_weekly_availability_member_day_unique"',
    );
    expect(migrationSource).toContain('"availability_override_reason" text');
  });

  test("validates complete and internally consistent weekly hours", () => {
    expect(staffWeeklyAvailabilitySchema.safeParse({ days: weekdays }).success).toBe(
      true,
    );
    expect(
      staffWeeklyAvailabilitySchema.safeParse({ days: weekdays.slice(0, 6) })
        .success,
    ).toBe(false);
    expect(
      staffWeeklyAvailabilitySchema.safeParse({
        days: weekdays.map((day) =>
          day.dayOfWeek === 1
            ? { ...day, startsMinute: 1020, endsMinute: 540 }
            : day,
        ),
      }).success,
    ).toBe(false);
  });

  test("protects personal availability updates with schedule access", () => {
    const routeSource = readFileSync(
      "app/api/tenant/availability/route.ts",
      "utf8",
    );
    const serviceSource = readFileSync("lib/staff-availability.ts", "utf8");

    expect(routeSource).toContain(
      'requireStaffPermission("staff_schedule.view")',
    );
    expect(serviceSource).toContain("input.actor.membershipId");
    expect(serviceSource).toContain('action: "staff_availability.update"');
  });

  test("enforces availability and records deliberate manager overrides", () => {
    const scheduleSource = readFileSync("lib/staff-schedule.ts", "utf8");

    expect(scheduleSource).toContain("isShiftWithinStaffAvailability");
    expect(scheduleSource).toContain(
      "This shift is outside the staff member's availability.",
    );
    expect(scheduleSource).toContain(
      "availabilityOverrideReason: parsed.availabilityOverrideReason",
    );
  });

  test("keeps availability inside existing schedule screens", () => {
    const personalPage = readFileSync(
      "app/restaurants/[restaurantSlug]/schedule/page.tsx",
      "utf8",
    );
    const managerPanel = readFileSync(
      "components/admin/StaffScheduleManager.tsx",
      "utf8",
    );

    expect(personalPage).toContain("StaffAvailabilityPanel");
    expect(managerPanel).toContain("Declared availability");
    expect(managerPanel).toContain("Availability override reason");
  });
});
