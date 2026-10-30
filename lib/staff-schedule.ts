import "server-only";

import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  restaurantJobs,
  staffJobAssignments,
  staffScheduledShifts,
  staffShiftCoverClaims,
  staffShiftCoverRequests,
  staffShifts,
  users,
} from "@/db/schema";
import { toUtcDateTime } from "@/lib/business-date";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import {
  getStaffWeeklyAvailability,
  getStaffWeeklyAvailabilityMap,
  isShiftWithinStaffAvailability,
} from "@/lib/staff-availability";
import {
  getPersonalStaffTimeOffRequests,
  getStaffTimeOffRequests,
  hasApprovedTimeOffConflict,
} from "@/lib/staff-time-off";
import type { TenantContext } from "@/lib/tenant-context";
import { staffScheduledShiftSchema } from "@/lib/validations/staff-schedule";
import type {
  StaffScheduleConfiguration,
  StaffScheduledShiftRecord,
} from "@/types/staff-schedule";
import type { StaffTimeClockScheduledShift } from "@/types/staff-time-clock";

export class StaffScheduleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffScheduleError";
    this.status = status;
  }
}

async function getRestaurantTimezone(context: TenantContext) {
  const [organization] = await getDb()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  if (!organization) {
    throw new StaffScheduleError("Restaurant was not found.", 404);
  }

  return organization.timezone;
}

function serializeShift(shift: {
  id: string;
  membershipId: string | null;
  staffName: string | null;
  jobId: string;
  jobName: string;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  status: "PUBLISHED" | "CANCELLED";
  note: string | null;
  availabilityOverrideReason: string | null;
}): StaffScheduledShiftRecord {
  return {
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
  };
}

async function getScheduleRows(
  context: TenantContext,
  options: { membershipId?: string; includeCancelled?: boolean } = {},
) {
  const oldestEnd = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  return getDb()
    .select({
      id: staffScheduledShifts.id,
      membershipId: staffScheduledShifts.membershipId,
      staffName: users.name,
      jobId: staffScheduledShifts.jobId,
      jobName: restaurantJobs.name,
      startsAt: staffScheduledShifts.startsAt,
      endsAt: staffScheduledShifts.endsAt,
      breakMinutes: staffScheduledShifts.breakMinutes,
      status: staffScheduledShifts.status,
      note: staffScheduledShifts.note,
      availabilityOverrideReason:
        staffScheduledShifts.availabilityOverrideReason,
    })
    .from(staffScheduledShifts)
    .leftJoin(
      memberships,
      and(
        eq(memberships.id, staffScheduledShifts.membershipId),
        eq(memberships.organizationId, staffScheduledShifts.organizationId),
      ),
    )
    .leftJoin(users, eq(users.id, memberships.userId))
    .innerJoin(
      restaurantJobs,
      and(
        eq(restaurantJobs.id, staffScheduledShifts.jobId),
        eq(
          restaurantJobs.organizationId,
          staffScheduledShifts.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(staffScheduledShifts.organizationId, context.organizationId),
        gte(staffScheduledShifts.endsAt, oldestEnd),
        ...(options.membershipId
          ? [eq(staffScheduledShifts.membershipId, options.membershipId)]
          : []),
        ...(!options.includeCancelled
          ? [eq(staffScheduledShifts.status, "PUBLISHED" as const)]
          : []),
      ),
    )
    .orderBy(asc(staffScheduledShifts.startsAt));
}

export async function getStaffScheduleConfiguration(
  context: TenantContext,
): Promise<StaffScheduleConfiguration> {
  const db = getDb();
  const [
    timezone,
    memberRows,
    jobRows,
    assignmentRows,
    shiftRows,
    timeOffRequests,
  ] =
    await Promise.all([
      getRestaurantTimezone(context),
      db
        .select({
          membershipId: memberships.id,
          staffName: users.name,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, context.organizationId),
            eq(memberships.isActive, true),
            eq(users.status, "ACTIVE"),
            inArray(memberships.role, [
              "RESTAURANT_MANAGER",
              "ORDER_OPERATOR",
            ]),
          ),
        )
        .orderBy(asc(users.name)),
      db
        .select({ id: restaurantJobs.id, name: restaurantJobs.name })
        .from(restaurantJobs)
        .where(
          and(
            eq(restaurantJobs.organizationId, context.organizationId),
            eq(restaurantJobs.isActive, true),
          ),
        )
        .orderBy(asc(restaurantJobs.sortOrder), asc(restaurantJobs.name)),
      db
        .select({
          membershipId: staffJobAssignments.membershipId,
          id: restaurantJobs.id,
          name: restaurantJobs.name,
          isPrimary: staffJobAssignments.isPrimary,
        })
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
          eq(staffJobAssignments.organizationId, context.organizationId),
        )
        .orderBy(
          asc(staffJobAssignments.membershipId),
          asc(restaurantJobs.sortOrder),
        ),
      getScheduleRows(context, { includeCancelled: true }),
      getStaffTimeOffRequests(context),
    ]);
  const availabilityByMembership = await getStaffWeeklyAvailabilityMap(
    memberRows.map((member) => member.membershipId),
    context,
  );

  return {
    timezone,
    jobs: jobRows,
    members: memberRows.map((member) => ({
      ...member,
      jobs: assignmentRows
        .filter((assignment) => assignment.membershipId === member.membershipId)
        .map((assignment) => ({
          id: assignment.id,
          name: assignment.name,
          isPrimary: assignment.isPrimary,
        })),
      availability: availabilityByMembership.get(member.membershipId) ?? {
        configured: false,
        days: [],
      },
    })),
    shifts: shiftRows.map(serializeShift),
    timeOffRequests,
  };
}

export async function getPersonalStaffSchedule(
  membershipId: string,
  context: TenantContext,
) {
  const [timezone, shifts, timeOffRequests, availability] = await Promise.all([
    getRestaurantTimezone(context),
    getScheduleRows(context, { membershipId }),
    getPersonalStaffTimeOffRequests(membershipId, context),
    getStaffWeeklyAvailability(membershipId, context),
  ]);

  return {
    timezone,
    shifts: shifts.map(serializeShift),
    timeOffRequests,
    availability,
  };
}

export async function getUpcomingTimeClockSchedule(
  membershipId: string,
  context: TenantContext,
): Promise<StaffTimeClockScheduledShift[]> {
  const now = new Date();
  const earliestEnd = new Date(now.getTime() - 4 * 60 * 60_000);
  const latestStart = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  const rows = await getDb()
    .select({
      id: staffScheduledShifts.id,
      jobId: staffScheduledShifts.jobId,
      jobName: restaurantJobs.name,
      startsAt: staffScheduledShifts.startsAt,
      endsAt: staffScheduledShifts.endsAt,
    })
    .from(staffScheduledShifts)
    .innerJoin(
      restaurantJobs,
      and(
        eq(restaurantJobs.id, staffScheduledShifts.jobId),
        eq(
          restaurantJobs.organizationId,
          staffScheduledShifts.organizationId,
        ),
      ),
    )
    .leftJoin(
      staffShifts,
      and(
        eq(staffShifts.scheduledShiftId, staffScheduledShifts.id),
        eq(staffShifts.organizationId, staffScheduledShifts.organizationId),
      ),
    )
    .where(
      and(
        eq(staffScheduledShifts.organizationId, context.organizationId),
        eq(staffScheduledShifts.membershipId, membershipId),
        eq(staffScheduledShifts.status, "PUBLISHED"),
        gt(staffScheduledShifts.endsAt, earliestEnd),
        lt(staffScheduledShifts.startsAt, latestStart),
        isNull(staffShifts.id),
      ),
    )
    .orderBy(asc(staffScheduledShifts.startsAt))
    .limit(10);

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }));
}

export async function saveStaffScheduledShift(
  input: unknown,
  options: {
    context: TenantContext;
    createdByMembershipId: string;
    scheduledShiftId?: string;
  },
) {
  const parsed = staffScheduledShiftSchema.parse(input);
  const timezone = await getRestaurantTimezone(options.context);
  const startsAt = toUtcDateTime(parsed.startsAt, timezone);
  const endsAt = toUtcDateTime(parsed.endsAt, timezone);
  const durationMinutes = Math.floor(
    (endsAt.getTime() - startsAt.getTime()) / 60_000,
  );

  if (durationMinutes <= 0 || durationMinutes > 24 * 60) {
    throw new StaffScheduleError(
      "A scheduled shift must be longer than zero and no more than 24 hours.",
    );
  }

  if (parsed.breakMinutes >= durationMinutes) {
    throw new StaffScheduleError(
      "Break time must be shorter than the scheduled shift.",
    );
  }

  if (parsed.membershipId) {
    if (
      await hasApprovedTimeOffConflict({
        context: options.context,
        membershipId: parsed.membershipId,
        startsOn: parsed.startsAt.slice(0, 10),
        endsOn: parsed.endsAt.slice(0, 10),
      })
    ) {
      throw new StaffScheduleError(
        "This staff member has approved time off during the selected dates.",
        409,
      );
    }

    const withinAvailability = await isShiftWithinStaffAvailability({
      context: options.context,
      membershipId: parsed.membershipId,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
    });

    if (!withinAvailability && !parsed.availabilityOverrideReason) {
      throw new StaffScheduleError(
        "This shift is outside the staff member's availability. Add an override reason to continue.",
        409,
      );
    }
  }

  const db = getDb();
  if (parsed.membershipId) {
    const [assignment] = await db
      .select({ id: staffJobAssignments.id })
      .from(staffJobAssignments)
      .innerJoin(
        memberships,
        and(
          eq(memberships.id, staffJobAssignments.membershipId),
          eq(memberships.organizationId, staffJobAssignments.organizationId),
          eq(memberships.isActive, true),
        ),
      )
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
          eq(staffJobAssignments.organizationId, options.context.organizationId),
          eq(staffJobAssignments.membershipId, parsed.membershipId),
          eq(staffJobAssignments.jobId, parsed.jobId),
        ),
      )
      .limit(1);

    if (!assignment) {
      throw new StaffScheduleError(
        "Choose an active job assigned to this staff member.",
        409,
      );
    }
  } else {
    const [activeJob] = await db
      .select({ id: restaurantJobs.id })
      .from(restaurantJobs)
      .where(
        and(
          eq(restaurantJobs.id, parsed.jobId),
          eq(restaurantJobs.organizationId, options.context.organizationId),
          eq(restaurantJobs.isActive, true),
        ),
      )
      .limit(1);

    if (!activeJob) {
      throw new StaffScheduleError("Choose an active restaurant job.", 409);
    }
  }

  let existingMembershipId: string | null | undefined;

  if (options.scheduledShiftId) {
    const [existing] = await db
      .select({
        id: staffScheduledShifts.id,
        membershipId: staffScheduledShifts.membershipId,
        status: staffScheduledShifts.status,
      })
      .from(staffScheduledShifts)
      .where(
        and(
          eq(staffScheduledShifts.id, options.scheduledShiftId),
          eq(
            staffScheduledShifts.organizationId,
            options.context.organizationId,
          ),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new StaffScheduleError("Scheduled shift was not found.", 404);
    }

    if (existing.status === "CANCELLED") {
      throw new StaffScheduleError("A cancelled shift cannot be edited.", 409);
    }

    existingMembershipId = existing.membershipId;
  }

  if (parsed.membershipId) {
    const overlapConditions = [
      eq(staffScheduledShifts.organizationId, options.context.organizationId),
      eq(staffScheduledShifts.membershipId, parsed.membershipId),
      eq(staffScheduledShifts.status, "PUBLISHED" as const),
      lt(staffScheduledShifts.startsAt, endsAt),
      gt(staffScheduledShifts.endsAt, startsAt),
    ];

    if (options.scheduledShiftId) {
      overlapConditions.push(
        ne(staffScheduledShifts.id, options.scheduledShiftId),
      );
    }

    const [overlap] = await db
      .select({ id: staffScheduledShifts.id })
      .from(staffScheduledShifts)
      .where(and(...overlapConditions))
      .limit(1);

    if (overlap) {
      throw new StaffScheduleError(
        "This staff member already has an overlapping scheduled shift.",
        409,
      );
    }
  }

  try {
    if (options.scheduledShiftId) {
      const [updated] = await db
        .update(staffScheduledShifts)
        .set({
          membershipId: parsed.membershipId,
          jobId: parsed.jobId,
          startsAt,
          endsAt,
          breakMinutes: parsed.breakMinutes,
          note: parsed.note,
          availabilityOverrideReason: parsed.availabilityOverrideReason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffScheduledShifts.id, options.scheduledShiftId),
            eq(
              staffScheduledShifts.organizationId,
              options.context.organizationId,
            ),
          ),
        )
        .returning({ id: staffScheduledShifts.id });

      if (parsed.membershipId === null) {
        await db
          .insert(staffShiftCoverRequests)
          .values({
            organizationId: options.context.organizationId,
            scheduledShiftId: options.scheduledShiftId,
            requestedByMembershipId: null,
            kind: "OPEN_SHIFT",
            reason: "Published as an open shift.",
          })
          .onConflictDoNothing();
      } else if (existingMembershipId !== parsed.membershipId) {
        await db
          .update(staffShiftCoverRequests)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(
            and(
              eq(
                staffShiftCoverRequests.scheduledShiftId,
                options.scheduledShiftId,
              ),
              eq(staffShiftCoverRequests.status, "OPEN"),
            ),
          );
      }

      return updated?.id ?? null;
    }

    const [created] = await db
      .insert(staffScheduledShifts)
      .values({
        organizationId: options.context.organizationId,
        membershipId: parsed.membershipId,
        jobId: parsed.jobId,
        startsAt,
        endsAt,
        breakMinutes: parsed.breakMinutes,
        note: parsed.note,
        availabilityOverrideReason: parsed.availabilityOverrideReason,
        createdByMembershipId: options.createdByMembershipId,
      })
      .returning({ id: staffScheduledShifts.id });

    if (parsed.membershipId === null) {
      await db.insert(staffShiftCoverRequests).values({
        organizationId: options.context.organizationId,
        scheduledShiftId: created.id,
        requestedByMembershipId: null,
        kind: "OPEN_SHIFT",
        reason: "Published as an open shift.",
      });
    }

    return created.id;
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new StaffScheduleError(
        "This staff member already has a shift starting at that time.",
        409,
      );
    }

    throw error;
  }
}

export async function cancelStaffScheduledShift(
  scheduledShiftId: string,
  context: TenantContext,
) {
  const [cancelled] = await getDb()
    .update(staffScheduledShifts)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(staffScheduledShifts.id, scheduledShiftId),
        eq(staffScheduledShifts.organizationId, context.organizationId),
        eq(staffScheduledShifts.status, "PUBLISHED"),
      ),
    )
    .returning({ id: staffScheduledShifts.id });

  if (!cancelled) {
    throw new StaffScheduleError(
      "Scheduled shift was not found or is already cancelled.",
      404,
    );
  }

  const openRequests = await getDb()
    .update(staffShiftCoverRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(staffShiftCoverRequests.scheduledShiftId, scheduledShiftId),
        eq(staffShiftCoverRequests.organizationId, context.organizationId),
        eq(staffShiftCoverRequests.status, "OPEN"),
      ),
    )
    .returning({ id: staffShiftCoverRequests.id });

  if (openRequests.length) {
    await getDb()
      .update(staffShiftCoverClaims)
      .set({ status: "DECLINED", updatedAt: new Date() })
      .where(
        and(
          inArray(
            staffShiftCoverClaims.requestId,
            openRequests.map((request) => request.id),
          ),
          eq(staffShiftCoverClaims.status, "PENDING"),
        ),
      );
  }
}
