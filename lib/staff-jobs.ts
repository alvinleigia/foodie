import "server-only";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  restaurantJobs,
  staffJobAssignments,
  staffPayrollProfiles,
} from "@/db/schema";
import {
  isStaffPermission,
  type StaffPermission,
} from "@/lib/staff-permissions";
import {
  getDefaultTenantContext,
  type TenantContext,
} from "@/lib/tenant-context";
import {
  staffJobAssignmentSchema,
  staffJobSchema,
  type StaffJobAssignmentInput,
  type StaffJobInput,
} from "@/lib/validations/staff-job";
import type {
  StaffJobAssignment,
  StaffJobConfiguration,
  StaffJobRecord,
} from "@/types/staff-jobs";

export class StaffJobConflictError extends Error {}

function normalizeJobPermissions(value: unknown): StaffPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (permission): permission is StaffPermission =>
          typeof permission === "string" && isStaffPermission(permission),
      ),
    ),
  );
}

export async function getStaffJobConfiguration(
  context: TenantContext = getDefaultTenantContext(),
): Promise<StaffJobConfiguration> {
  const db = getDb();
  const [jobs, assignments] = await Promise.all([
    db
      .select()
      .from(restaurantJobs)
      .where(eq(restaurantJobs.organizationId, context.organizationId))
      .orderBy(asc(restaurantJobs.sortOrder), asc(restaurantJobs.name)),
    db
      .select({
        membershipId: staffJobAssignments.membershipId,
        jobId: staffJobAssignments.jobId,
        isPrimary: staffJobAssignments.isPrimary,
        hourlyRateMinor: staffJobAssignments.hourlyRateMinor,
      })
      .from(staffJobAssignments)
      .where(eq(staffJobAssignments.organizationId, context.organizationId)),
  ]);
  const assignmentCounts = new Map<string, number>();

  for (const assignment of assignments) {
    assignmentCounts.set(
      assignment.jobId,
      (assignmentCounts.get(assignment.jobId) ?? 0) + 1,
    );
  }

  return {
    jobs: jobs.map<StaffJobRecord>((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      permissions: normalizeJobPermissions(job.permissions),
      sortOrder: job.sortOrder,
      isActive: job.isActive,
      assignedStaffCount: assignmentCounts.get(job.id) ?? 0,
    })),
    assignments,
  };
}

export async function getStaffJobAssignment(
  membershipId: string,
  context: TenantContext = getDefaultTenantContext(),
): Promise<StaffJobAssignment> {
  const [assignments, [organization], [payrollProfile]] = await Promise.all([
    getDb()
      .select({
        jobId: staffJobAssignments.jobId,
        isPrimary: staffJobAssignments.isPrimary,
        hourlyRateMinor: staffJobAssignments.hourlyRateMinor,
      })
      .from(staffJobAssignments)
      .where(
        and(
          eq(staffJobAssignments.organizationId, context.organizationId),
          eq(staffJobAssignments.membershipId, membershipId),
        ),
      ),
    getDb()
      .select({ currency: organizations.currency })
      .from(organizations)
      .where(eq(organizations.id, context.organizationId))
      .limit(1),
    getDb()
      .select({ employeeReference: staffPayrollProfiles.employeeReference })
      .from(staffPayrollProfiles)
      .where(
        and(
          eq(staffPayrollProfiles.organizationId, context.organizationId),
          eq(staffPayrollProfiles.membershipId, membershipId),
        ),
      )
      .limit(1),
  ]);

  if (!organization) {
    throw new StaffJobConflictError("Restaurant not found.");
  }

  return {
    currency: organization.currency,
    jobIds: assignments.map((assignment) => assignment.jobId),
    payrollEmployeeReference: payrollProfile?.employeeReference ?? null,
    payRates: assignments.map((assignment) => ({
      jobId: assignment.jobId,
      hourlyRateMinor: assignment.hourlyRateMinor,
    })),
    primaryJobId:
      assignments.find((assignment) => assignment.isPrimary)?.jobId ?? null,
  };
}

export async function getPrimaryStaffJobPermissions(
  membershipId: string,
  context: TenantContext = getDefaultTenantContext(),
) {
  const [job] = await getDb()
    .select({ permissions: restaurantJobs.permissions })
    .from(staffJobAssignments)
    .innerJoin(
      restaurantJobs,
      and(
        eq(restaurantJobs.id, staffJobAssignments.jobId),
        eq(
          restaurantJobs.organizationId,
          staffJobAssignments.organizationId,
        ),
        eq(restaurantJobs.isActive, true),
      ),
    )
    .where(
      and(
        eq(staffJobAssignments.organizationId, context.organizationId),
        eq(staffJobAssignments.membershipId, membershipId),
        eq(staffJobAssignments.isPrimary, true),
      ),
    )
    .limit(1);

  return job ? normalizeJobPermissions(job.permissions) : null;
}

export async function saveStaffJob(
  input: StaffJobInput,
  options: {
    context?: TenantContext;
    jobId?: string;
  } = {},
) {
  const parsed = staffJobSchema.parse(input);
  const context = options.context ?? getDefaultTenantContext();
  const db = getDb();
  let savedJobId: string | null = null;

  await db.transaction(async (tx) => {
    const duplicateNameConditions = [
      eq(restaurantJobs.organizationId, context.organizationId),
      sql`lower(${restaurantJobs.name}) = lower(${parsed.name})`,
    ];

    if (options.jobId) {
      duplicateNameConditions.push(ne(restaurantJobs.id, options.jobId));
    }

    const [duplicate] = await tx
      .select({ id: restaurantJobs.id })
      .from(restaurantJobs)
      .where(and(...duplicateNameConditions))
      .limit(1);

    if (duplicate) {
      throw new StaffJobConflictError(
        "A job with this name already exists for the restaurant.",
      );
    }

    if (options.jobId) {
      const [existing] = await tx
        .select()
        .from(restaurantJobs)
        .where(
          and(
            eq(restaurantJobs.id, options.jobId),
            eq(restaurantJobs.organizationId, context.organizationId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new StaffJobConflictError("Staff job not found.");
      }

      if (existing.isActive && !parsed.isActive) {
        const [assignment] = await tx
          .select({ id: staffJobAssignments.id })
          .from(staffJobAssignments)
          .where(
            and(
              eq(
                staffJobAssignments.organizationId,
                context.organizationId,
              ),
              eq(staffJobAssignments.jobId, existing.id),
            ),
          )
          .limit(1);

        if (assignment) {
          throw new StaffJobConflictError(
            "Reassign this job's staff before deactivating it.",
          );
        }
      }

      await tx
        .update(restaurantJobs)
        .set({
          name: parsed.name,
          description: parsed.description,
          permissions: parsed.permissions,
          sortOrder: parsed.sortOrder,
          isActive: parsed.isActive,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(restaurantJobs.id, existing.id),
            eq(restaurantJobs.organizationId, context.organizationId),
          ),
        );
      savedJobId = existing.id;
      return;
    }

    const [created] = await tx
      .insert(restaurantJobs)
      .values({
        organizationId: context.organizationId,
        name: parsed.name,
        description: parsed.description,
        permissions: parsed.permissions,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
        updatedAt: new Date(),
      })
      .returning({ id: restaurantJobs.id });
    savedJobId = created?.id ?? null;
  });

  return {
    savedJobId,
    configuration: await getStaffJobConfiguration(context),
  };
}

export async function replaceStaffJobAssignments(
  membershipId: string,
  input: StaffJobAssignmentInput,
  context: TenantContext = getDefaultTenantContext(),
) {
  const parsed = staffJobAssignmentSchema.parse(input);
  const db = getDb();
  const rateByJobId = new Map(
    parsed.payRates.map((rate) => [rate.jobId, rate.hourlyRateMinor]),
  );

  await db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new StaffJobConflictError("Staff membership not found.");
    }

    if (parsed.jobIds.length) {
      const jobs = await tx
        .select({ id: restaurantJobs.id })
        .from(restaurantJobs)
        .where(
          and(
            eq(restaurantJobs.organizationId, context.organizationId),
            eq(restaurantJobs.isActive, true),
            inArray(restaurantJobs.id, parsed.jobIds),
          ),
        );

      if (jobs.length !== parsed.jobIds.length) {
        throw new StaffJobConflictError(
          "One or more selected jobs are unavailable.",
        );
      }
    }

    await tx
      .delete(staffJobAssignments)
      .where(
        and(
          eq(staffJobAssignments.organizationId, context.organizationId),
          eq(staffJobAssignments.membershipId, membershipId),
        ),
      );

    if (parsed.jobIds.length) {
      await tx.insert(staffJobAssignments).values(
        parsed.jobIds.map((jobId) => ({
          organizationId: context.organizationId,
          membershipId,
          jobId,
          isPrimary: jobId === parsed.primaryJobId,
          hourlyRateMinor: rateByJobId.get(jobId) ?? null,
          updatedAt: new Date(),
        })),
      );
    }

    if (parsed.payrollEmployeeReference) {
      await tx
        .insert(staffPayrollProfiles)
        .values({
          organizationId: context.organizationId,
          membershipId,
          employeeReference: parsed.payrollEmployeeReference,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: staffPayrollProfiles.membershipId,
          set: {
            employeeReference: parsed.payrollEmployeeReference,
            updatedAt: new Date(),
          },
        });
    } else {
      await tx
        .delete(staffPayrollProfiles)
        .where(
          and(
            eq(staffPayrollProfiles.organizationId, context.organizationId),
            eq(staffPayrollProfiles.membershipId, membershipId),
          ),
        );
    }
  });

  return getStaffJobAssignment(membershipId, context);
}
