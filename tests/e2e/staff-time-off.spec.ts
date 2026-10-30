import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  staffTimeOffRequestSchema,
  staffTimeOffReviewSchema,
} from "@/lib/validations/staff-schedule";

test.describe("staff time off", () => {
  test("stores tenant-scoped requests with review history", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0068_staff_time_off.sql",
      "utf8",
    );

    expect(schemaSource).toContain("staffTimeOffRequests");
    expect(schemaSource).toContain(
      'name: "staff_time_off_requests_membership_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CHECK ("status" IN (\'PENDING\', \'APPROVED\', \'DECLINED\', \'CANCELLED\'))',
    );
    expect(migrationSource).toContain('"reviewed_by_user_id" uuid');
  });

  test("validates request ranges and manager decisions", () => {
    expect(
      staffTimeOffRequestSchema.safeParse({
        startsOn: "2026-11-02",
        endsOn: "2026-11-02",
        reason: "Appointment",
      }).success,
    ).toBe(true);
    expect(
      staffTimeOffRequestSchema.safeParse({
        startsOn: "2026-11-03",
        endsOn: "2026-11-02",
      }).success,
    ).toBe(false);
    expect(
      staffTimeOffReviewSchema.safeParse({ status: "APPROVED" }).success,
    ).toBe(true);
  });

  test("protects staff and manager mutations with schedule permissions", () => {
    const personalRoute = readFileSync(
      "app/api/tenant/time-off/route.ts",
      "utf8",
    );
    const cancellationRoute = readFileSync(
      "app/api/tenant/time-off/[requestId]/route.ts",
      "utf8",
    );
    const reviewRoute = readFileSync(
      "app/api/tenant/admin/time-off/[requestId]/route.ts",
      "utf8",
    );

    expect(personalRoute).toContain(
      'requireStaffPermission("staff_schedule.view")',
    );
    expect(cancellationRoute).toContain(
      'requireStaffPermission("staff_schedule.view")',
    );
    expect(reviewRoute).toContain(
      'requireStaffPermission("staff_schedule.manage")',
    );
  });

  test("audits requests, cancellations and manager reviews", () => {
    const serviceSource = readFileSync("lib/staff-time-off.ts", "utf8");

    expect(serviceSource).toContain('action: "staff_time_off.request"');
    expect(serviceSource).toContain('action: "staff_time_off.cancel"');
    expect(serviceSource).toContain(
      "`staff_time_off.${parsed.status.toLowerCase()}`",
    );
  });

  test("blocks shifts during approved leave and conflicting approvals", () => {
    const scheduleSource = readFileSync("lib/staff-schedule.ts", "utf8");
    const timeOffSource = readFileSync("lib/staff-time-off.ts", "utf8");

    expect(scheduleSource).toContain("hasApprovedTimeOffConflict");
    expect(scheduleSource).toContain(
      "This staff member has approved time off during the selected dates.",
    );
    expect(timeOffSource).toContain(
      "Cancel the overlapping published shift before approving this request.",
    );
  });

  test("keeps requests inside the existing schedule screens", () => {
    const managerPage = readFileSync(
      "app/restaurants/[restaurantSlug]/staff/schedule/page.tsx",
      "utf8",
    );
    const personalPage = readFileSync(
      "app/restaurants/[restaurantSlug]/schedule/page.tsx",
      "utf8",
    );

    expect(managerPage).toContain("StaffTimeOffManager");
    expect(personalPage).toContain("StaffTimeOffPanel");
  });
});
