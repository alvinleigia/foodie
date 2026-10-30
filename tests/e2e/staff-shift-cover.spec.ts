import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  staffShiftCoverClaimSchema,
  staffShiftCoverReviewSchema,
} from "@/lib/validations/staff-schedule";

test.describe("staff open shifts and cover", () => {
  test("stores unassigned shifts, cover requests and volunteer claims", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0070_staff_shift_cover.sql",
      "utf8",
    );

    expect(migrationSource).toContain(
      'ALTER COLUMN "membership_id" DROP NOT NULL',
    );
    expect(schemaSource).toContain("staffShiftCoverRequests");
    expect(schemaSource).toContain("staffShiftCoverClaims");
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_shift_cover_requests_open_shift_unique"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_shift_cover_claims_request_member_unique"',
    );
  });

  test("validates volunteer and manager decisions", () => {
    expect(
      staffShiftCoverClaimSchema.safeParse({
        requestId: "00000000-0000-4000-8000-000000000001",
        note: "I can cover this shift.",
      }).success,
    ).toBe(true);
    expect(
      staffShiftCoverReviewSchema.safeParse({
        claimId: "00000000-0000-4000-8000-000000000002",
        status: "APPROVED",
      }).success,
    ).toBe(true);
  });

  test("protects employee and manager routes with schedule permissions", () => {
    const employeeRoute = readFileSync(
      "app/api/tenant/shift-cover/route.ts",
      "utf8",
    );
    const managerRoute = readFileSync(
      "app/api/tenant/admin/shift-cover/[requestId]/route.ts",
      "utf8",
    );

    expect(employeeRoute).toContain(
      'requireStaffPermission("staff_schedule.view")',
    );
    expect(managerRoute).toContain(
      'requireStaffPermission("staff_schedule.manage")',
    );
  });

  test("rechecks job, overlap and leave eligibility at approval", () => {
    const serviceSource = readFileSync("lib/staff-shift-cover.ts", "utf8");

    expect(serviceSource).toContain("assertEligibleForShift");
    expect(serviceSource).toContain("staffJobAssignments");
    expect(serviceSource).toContain("hasApprovedTimeOffConflict");
    expect(serviceSource).toContain("already filled");
    expect(serviceSource).toContain(
      'availabilityOverrideReason: eligibility.withinAvailability',
    );
  });

  test("audits request, claim, withdrawal, cancellation and review", () => {
    const serviceSource = readFileSync("lib/staff-shift-cover.ts", "utf8");

    for (const action of [
      "staff_shift_cover.request",
      "staff_shift_cover.claim",
      "staff_shift_cover.withdraw",
      "staff_shift_cover.cancel",
    ]) {
      expect(serviceSource).toContain(action);
    }
    expect(serviceSource).toContain(
      "`staff_shift_cover.${parsed.status.toLowerCase()}`",
    );
  });

  test("publishes employee and manager workflows on schedule screens", () => {
    const managerPage = readFileSync(
      "app/restaurants/[restaurantSlug]/staff/schedule/page.tsx",
      "utf8",
    );
    const personalPage = readFileSync(
      "app/restaurants/[restaurantSlug]/schedule/page.tsx",
      "utf8",
    );
    const scheduleManager = readFileSync(
      "components/admin/StaffScheduleManager.tsx",
      "utf8",
    );

    expect(managerPage).toContain("StaffShiftCoverManager");
    expect(personalPage).toContain("StaffShiftCoverPanel");
    expect(scheduleManager).toContain("Open shift (unassigned)");
  });
});
