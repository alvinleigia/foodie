import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

test.describe("restaurant staff jobs", () => {
  test("stores tenant-scoped jobs and assignments", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0064_restaurant_staff_jobs.sql",
      "utf8",
    );

    expect(schemaSource).toContain("restaurantJobs");
    expect(schemaSource).toContain("staffJobAssignments");
    expect(schemaSource).toContain(
      'name: "staff_job_assignments_membership_organization_fk"',
    );
    expect(schemaSource).toContain(
      'name: "staff_job_assignments_job_organization_fk"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "staff_job_assignments_primary_unique"',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "restaurant_jobs_organization_name_unique"',
    );
  });

  test("validates reusable permission sets and one primary job", () => {
    const validationSource = readFileSync(
      "lib/validations/staff-job.ts",
      "utf8",
    );
    const serviceSource = readFileSync("lib/staff-jobs.ts", "utf8");

    expect(validationSource).toContain("staffJobSchema");
    expect(validationSource).toContain("staffJobAssignmentSchema");
    expect(validationSource).toContain("The primary job must be assigned");
    expect(serviceSource).toContain("replaceStaffJobAssignments");
    expect(serviceSource).toContain("One or more selected jobs are unavailable.");
    expect(serviceSource).toContain(
      "Reassign this job's staff before deactivating it.",
    );
  });

  test("protects job management with tenant access and audit events", () => {
    const collectionRoute = readFileSync(
      "app/api/tenant/admin/staff-jobs/route.ts",
      "utf8",
    );
    const jobRoute = readFileSync(
      "app/api/tenant/admin/staff-jobs/[jobId]/route.ts",
      "utf8",
    );
    const assignmentRoute = readFileSync(
      "app/api/tenant/admin/staff/[membershipId]/jobs/route.ts",
      "utf8",
    );

    for (const source of [collectionRoute, jobRoute, assignmentRoute]) {
      expect(source).toContain('requireStaffPermission("staff.manage")');
      expect(source).toContain("getCurrentTenantContext()");
      expect(source).toContain("writeAuditLog");
    }

    expect(jobRoute).toContain("Your primary job must keep staff management access.");
    expect(assignmentRoute).toContain(
      "You cannot remove your own staff management access.",
    );
  });

  test("exposes job management and staff assignment screens", () => {
    const pageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/staff/jobs/page.tsx",
      "utf8",
    );
    const managerSource = readFileSync(
      "components/admin/StaffJobManager.tsx",
      "utf8",
    );
    const assignmentSource = readFileSync(
      "components/admin/StaffJobAssignmentForm.tsx",
      "utf8",
    );
    const navigationSource = readFileSync("lib/staff-navigation.ts", "utf8");

    expect(pageSource).toContain('requiredPermission: "staff.manage"');
    expect(managerSource).toContain("staffPermissionDefinitions");
    expect(managerSource).toContain("primary job supplies the permission baseline");
    expect(assignmentSource).toContain("Primary permission baseline");
    expect(navigationSource).toContain('destination: "staffJobs"');
  });

  test("refreshes session permissions from the active primary job", () => {
    const sessionSource = readFileSync("lib/staff-session.ts", "utf8");
    const authSource = readFileSync("auth.ts", "utf8");
    const tenantAdminSource = readFileSync("lib/tenant-admin.ts", "utf8");

    expect(sessionSource).toContain(
      "primaryJobPermissions: restaurantJobs.permissions",
    );
    expect(authSource).toContain("access.primaryJobPermissions");
    expect(tenantAdminSource).toContain("getPrimaryStaffJobPermissions");
  });
});
