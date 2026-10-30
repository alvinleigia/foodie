import "server-only";

import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  restaurantJobs,
  staffJobAssignments,
  staffScheduledShifts,
  staffShiftCoverClaims,
  staffShiftCoverRequests,
  users,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import { isShiftWithinStaffAvailability } from "@/lib/staff-availability";
import type { MembershipRole } from "@/lib/staff-auth";
import { hasApprovedTimeOffConflict } from "@/lib/staff-time-off";
import type { TenantContext } from "@/lib/tenant-context";
import {
  staffShiftCoverClaimSchema,
  staffShiftCoverRequestSchema,
  staffShiftCoverReviewSchema,
} from "@/lib/validations/staff-schedule";
import type {
  StaffShiftCoverBoard,
  StaffShiftCoverRequestRecord,
} from "@/types/staff-schedule";

type CoverActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  username?: string;
};

export class StaffShiftCoverError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffShiftCoverError";
    this.status = status;
  }
}

async function getTimezone(context: TenantContext) {
  const [organization] = await getDb()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  if (!organization) {
    throw new StaffShiftCoverError("Restaurant was not found.", 404);
  }

  return organization.timezone;
}

function formatForTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

async function assertEligibleForShift(input: {
  context: TenantContext;
  endsAt: Date;
  jobId: string;
  membershipId: string;
  scheduledShiftId: string;
  startsAt: Date;
}) {
  const db = getDb();
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
    .where(
      and(
        eq(staffJobAssignments.organizationId, input.context.organizationId),
        eq(staffJobAssignments.membershipId, input.membershipId),
        eq(staffJobAssignments.jobId, input.jobId),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new StaffShiftCoverError(
      "This shift requires a job that is not assigned to you.",
      409,
    );
  }

  const [overlap] = await db
    .select({ id: staffScheduledShifts.id })
    .from(staffScheduledShifts)
    .where(
      and(
        eq(staffScheduledShifts.organizationId, input.context.organizationId),
        eq(staffScheduledShifts.membershipId, input.membershipId),
        eq(staffScheduledShifts.status, "PUBLISHED"),
        ne(staffScheduledShifts.id, input.scheduledShiftId),
        lt(staffScheduledShifts.startsAt, input.endsAt),
        gt(staffScheduledShifts.endsAt, input.startsAt),
      ),
    )
    .limit(1);

  if (overlap) {
    throw new StaffShiftCoverError(
      "This shift overlaps another scheduled shift.",
      409,
    );
  }

  const timezone = await getTimezone(input.context);
  const localStartsAt = formatForTimezone(input.startsAt, timezone);
  const localEndsAt = formatForTimezone(input.endsAt, timezone);

  if (
    await hasApprovedTimeOffConflict({
      context: input.context,
      membershipId: input.membershipId,
      startsOn: localStartsAt.slice(0, 10),
      endsOn: localEndsAt.slice(0, 10),
    })
  ) {
    throw new StaffShiftCoverError(
      "Approved time off conflicts with this shift.",
      409,
    );
  }

  return {
    withinAvailability: await isShiftWithinStaffAvailability({
      context: input.context,
      membershipId: input.membershipId,
      startsAt: localStartsAt,
      endsAt: localEndsAt,
    }),
  };
}

async function getCoverRows(context: TenantContext) {
  const requestRows = await getDb()
    .select({
      id: staffShiftCoverRequests.id,
      scheduledShiftId: staffShiftCoverRequests.scheduledShiftId,
      requestedByMembershipId: staffShiftCoverRequests.requestedByMembershipId,
      kind: staffShiftCoverRequests.kind,
      status: staffShiftCoverRequests.status,
      reason: staffShiftCoverRequests.reason,
      membershipId: staffScheduledShifts.membershipId,
      jobId: staffScheduledShifts.jobId,
      jobName: restaurantJobs.name,
      startsAt: staffScheduledShifts.startsAt,
      endsAt: staffScheduledShifts.endsAt,
    })
    .from(staffShiftCoverRequests)
    .innerJoin(
      staffScheduledShifts,
      and(
        eq(staffScheduledShifts.id, staffShiftCoverRequests.scheduledShiftId),
        eq(
          staffScheduledShifts.organizationId,
          staffShiftCoverRequests.organizationId,
        ),
      ),
    )
    .innerJoin(
      restaurantJobs,
      and(
        eq(restaurantJobs.id, staffScheduledShifts.jobId),
        eq(restaurantJobs.organizationId, staffScheduledShifts.organizationId),
      ),
    )
    .where(eq(staffShiftCoverRequests.organizationId, context.organizationId))
    .orderBy(desc(staffShiftCoverRequests.createdAt))
    .limit(100);

  const requestIds = requestRows.map((request) => request.id);
  const claimRows = requestIds.length
    ? await getDb()
        .select({
          id: staffShiftCoverClaims.id,
          requestId: staffShiftCoverClaims.requestId,
          membershipId: staffShiftCoverClaims.membershipId,
          note: staffShiftCoverClaims.note,
          status: staffShiftCoverClaims.status,
        })
        .from(staffShiftCoverClaims)
        .where(
          and(
            eq(staffShiftCoverClaims.organizationId, context.organizationId),
            inArray(staffShiftCoverClaims.requestId, requestIds),
          ),
        )
        .orderBy(desc(staffShiftCoverClaims.createdAt))
    : [];
  const membershipIds = [
    ...requestRows.flatMap((request) =>
      [request.membershipId, request.requestedByMembershipId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
    ...claimRows.map((claim) => claim.membershipId),
  ];
  const nameRows = membershipIds.length
    ? await getDb()
        .select({ membershipId: memberships.id, staffName: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, context.organizationId),
            inArray(memberships.id, [...new Set(membershipIds)]),
          ),
        )
    : [];
  const names = new Map(
    nameRows.map((row) => [row.membershipId, row.staffName]),
  );

  return requestRows.map(
    (request): StaffShiftCoverRequestRecord => ({
      ...request,
      requestedByName: request.requestedByMembershipId
        ? (names.get(request.requestedByMembershipId) ?? null)
        : null,
      staffName: request.membershipId
        ? (names.get(request.membershipId) ?? null)
        : null,
      startsAt: request.startsAt.toISOString(),
      endsAt: request.endsAt.toISOString(),
      claims: claimRows
        .filter((claim) => claim.requestId === request.id)
        .map((claim) => ({
          id: claim.id,
          membershipId: claim.membershipId,
          note: claim.note,
          status: claim.status,
          staffName: names.get(claim.membershipId) ?? "Staff member",
        })),
    }),
  );
}

export async function getManagerShiftCoverBoard(
  context: TenantContext,
): Promise<StaffShiftCoverBoard> {
  const [timezone, requests] = await Promise.all([
    getTimezone(context),
    getCoverRows(context),
  ]);
  return { timezone, requests };
}

export async function getPersonalShiftCoverBoard(
  membershipId: string,
  context: TenantContext,
): Promise<StaffShiftCoverBoard> {
  const [timezone, requests, assignmentRows] = await Promise.all([
    getTimezone(context),
    getCoverRows(context),
    getDb()
      .select({ jobId: staffJobAssignments.jobId })
      .from(staffJobAssignments)
      .where(
        and(
          eq(staffJobAssignments.organizationId, context.organizationId),
          eq(staffJobAssignments.membershipId, membershipId),
        ),
      ),
  ]);
  const jobIds = new Set(assignmentRows.map((assignment) => assignment.jobId));

  return {
    timezone,
    requests: requests
      .filter(
        (request) =>
          request.requestedByMembershipId === membershipId ||
          request.membershipId === membershipId ||
          request.claims.some((claim) => claim.membershipId === membershipId) ||
          (request.status === "OPEN" && jobIds.has(request.jobId)),
      )
      .map((request) => ({
        ...request,
        claims: request.claims.filter(
          (claim) => claim.membershipId === membershipId,
        ),
      })),
  };
}

export async function createStaffShiftCoverRequest(input: {
  actor: CoverActor;
  context: TenantContext;
  payload: unknown;
}) {
  const parsed = staffShiftCoverRequestSchema.parse(input.payload);
  const [shift] = await getDb()
    .select({ id: staffScheduledShifts.id, endsAt: staffScheduledShifts.endsAt })
    .from(staffScheduledShifts)
    .where(
      and(
        eq(staffScheduledShifts.id, parsed.scheduledShiftId),
        eq(staffScheduledShifts.organizationId, input.context.organizationId),
        eq(staffScheduledShifts.membershipId, input.actor.membershipId),
        eq(staffScheduledShifts.status, "PUBLISHED"),
        gt(staffScheduledShifts.endsAt, new Date()),
      ),
    )
    .limit(1);

  if (!shift) {
    throw new StaffShiftCoverError(
      "Only your upcoming published shifts can request cover.",
      409,
    );
  }

  try {
    const [created] = await getDb()
      .insert(staffShiftCoverRequests)
      .values({
        organizationId: input.context.organizationId,
        scheduledShiftId: shift.id,
        requestedByMembershipId: input.actor.membershipId,
        kind: "COVER_REQUEST",
        reason: parsed.reason,
      })
      .returning({ id: staffShiftCoverRequests.id });
    await writeAuditLog({
      actor: input.actor,
      organizationId: input.context.organizationId,
      action: "staff_shift_cover.request",
      entityType: "staff_shift_cover_request",
      entityId: created.id,
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new StaffShiftCoverError(
        "This shift already has an open cover request.",
        409,
      );
    }
    throw error;
  }

  return getPersonalShiftCoverBoard(input.actor.membershipId, input.context);
}

export async function ensureOpenShiftCoverRequest(input: {
  actor: CoverActor;
  context: TenantContext;
  scheduledShiftId: string;
}) {
  await getDb()
    .insert(staffShiftCoverRequests)
    .values({
      organizationId: input.context.organizationId,
      scheduledShiftId: input.scheduledShiftId,
      requestedByMembershipId: null,
      kind: "OPEN_SHIFT",
      reason: "Published as an open shift.",
    })
    .onConflictDoNothing();
  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift_cover.open_shift",
    entityType: "staff_scheduled_shift",
    entityId: input.scheduledShiftId,
  });
}

export async function claimStaffShiftCover(input: {
  actor: CoverActor;
  context: TenantContext;
  payload: unknown;
}) {
  const parsed = staffShiftCoverClaimSchema.parse(input.payload);
  const [request] = await getDb()
    .select({
      scheduledShiftId: staffShiftCoverRequests.scheduledShiftId,
      requestedByMembershipId: staffShiftCoverRequests.requestedByMembershipId,
      membershipId: staffScheduledShifts.membershipId,
      jobId: staffScheduledShifts.jobId,
      startsAt: staffScheduledShifts.startsAt,
      endsAt: staffScheduledShifts.endsAt,
    })
    .from(staffShiftCoverRequests)
    .innerJoin(
      staffScheduledShifts,
      eq(staffScheduledShifts.id, staffShiftCoverRequests.scheduledShiftId),
    )
    .where(
      and(
        eq(staffShiftCoverRequests.id, parsed.requestId),
        eq(staffShiftCoverRequests.organizationId, input.context.organizationId),
        eq(staffShiftCoverRequests.status, "OPEN"),
        eq(staffScheduledShifts.status, "PUBLISHED"),
        gt(staffScheduledShifts.endsAt, new Date()),
      ),
    )
    .limit(1);

  if (!request) {
    throw new StaffShiftCoverError("This cover request is no longer open.", 409);
  }

  if (
    request.membershipId === input.actor.membershipId ||
    request.requestedByMembershipId === input.actor.membershipId
  ) {
    throw new StaffShiftCoverError("You cannot cover your own shift.", 409);
  }

  await assertEligibleForShift({
    context: input.context,
    membershipId: input.actor.membershipId,
    scheduledShiftId: request.scheduledShiftId,
    jobId: request.jobId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
  });

  try {
    const [claim] = await getDb()
      .insert(staffShiftCoverClaims)
      .values({
        organizationId: input.context.organizationId,
        requestId: parsed.requestId,
        membershipId: input.actor.membershipId,
        note: parsed.note,
      })
      .returning({ id: staffShiftCoverClaims.id });
    await writeAuditLog({
      actor: input.actor,
      organizationId: input.context.organizationId,
      action: "staff_shift_cover.claim",
      entityType: "staff_shift_cover_claim",
      entityId: claim.id,
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new StaffShiftCoverError(
        "You already responded to this cover request.",
        409,
      );
    }
    throw error;
  }

  return getPersonalShiftCoverBoard(input.actor.membershipId, input.context);
}

export async function withdrawStaffShiftCoverClaim(input: {
  actor: CoverActor;
  claimId: string;
  context: TenantContext;
}) {
  const [withdrawn] = await getDb()
    .update(staffShiftCoverClaims)
    .set({ status: "WITHDRAWN", updatedAt: new Date() })
    .where(
      and(
        eq(staffShiftCoverClaims.id, input.claimId),
        eq(staffShiftCoverClaims.organizationId, input.context.organizationId),
        eq(staffShiftCoverClaims.membershipId, input.actor.membershipId),
        eq(staffShiftCoverClaims.status, "PENDING"),
      ),
    )
    .returning({ id: staffShiftCoverClaims.id });

  if (!withdrawn) {
    throw new StaffShiftCoverError("This offer cannot be withdrawn.", 409);
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift_cover.withdraw",
    entityType: "staff_shift_cover_claim",
    entityId: input.claimId,
  });
  return getPersonalShiftCoverBoard(input.actor.membershipId, input.context);
}

export async function cancelStaffShiftCoverRequest(input: {
  actor: CoverActor;
  context: TenantContext;
  manager: boolean;
  requestId: string;
}) {
  const conditions = [
    eq(staffShiftCoverRequests.id, input.requestId),
    eq(staffShiftCoverRequests.organizationId, input.context.organizationId),
    eq(staffShiftCoverRequests.status, "OPEN" as const),
  ];
  if (!input.manager) {
    conditions.push(
      eq(staffShiftCoverRequests.requestedByMembershipId, input.actor.membershipId),
    );
  }

  const [cancelled] = await getDb()
    .update(staffShiftCoverRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: staffShiftCoverRequests.id });
  if (!cancelled) {
    throw new StaffShiftCoverError("This cover request cannot be cancelled.", 409);
  }
  await getDb()
    .update(staffShiftCoverClaims)
    .set({ status: "DECLINED", updatedAt: new Date() })
    .where(
      and(
        eq(staffShiftCoverClaims.requestId, input.requestId),
        eq(staffShiftCoverClaims.status, "PENDING"),
      ),
    );
  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift_cover.cancel",
    entityType: "staff_shift_cover_request",
    entityId: input.requestId,
  });
  return input.manager
    ? getManagerShiftCoverBoard(input.context)
    : getPersonalShiftCoverBoard(input.actor.membershipId, input.context);
}

export async function reviewStaffShiftCoverClaim(input: {
  actor: CoverActor;
  context: TenantContext;
  payload: unknown;
  requestId: string;
}) {
  const parsed = staffShiftCoverReviewSchema.parse(input.payload);
  const [record] = await getDb()
    .select({
      claimId: staffShiftCoverClaims.id,
      claimMembershipId: staffShiftCoverClaims.membershipId,
      scheduledShiftId: staffShiftCoverRequests.scheduledShiftId,
      jobId: staffScheduledShifts.jobId,
      startsAt: staffScheduledShifts.startsAt,
      endsAt: staffScheduledShifts.endsAt,
    })
    .from(staffShiftCoverClaims)
    .innerJoin(
      staffShiftCoverRequests,
      and(
        eq(staffShiftCoverRequests.id, staffShiftCoverClaims.requestId),
        eq(
          staffShiftCoverRequests.organizationId,
          staffShiftCoverClaims.organizationId,
        ),
      ),
    )
    .innerJoin(
      staffScheduledShifts,
      eq(staffScheduledShifts.id, staffShiftCoverRequests.scheduledShiftId),
    )
    .where(
      and(
        eq(staffShiftCoverRequests.id, input.requestId),
        eq(staffShiftCoverClaims.id, parsed.claimId),
        eq(staffShiftCoverRequests.organizationId, input.context.organizationId),
        eq(staffShiftCoverRequests.status, "OPEN"),
        eq(staffShiftCoverClaims.status, "PENDING"),
      ),
    )
    .limit(1);

  if (!record) {
    throw new StaffShiftCoverError("This cover offer is no longer pending.", 409);
  }

  if (parsed.status === "DECLINED") {
    await getDb()
      .update(staffShiftCoverClaims)
      .set({ status: "DECLINED", updatedAt: new Date() })
      .where(eq(staffShiftCoverClaims.id, record.claimId));
  } else {
    const eligibility = await assertEligibleForShift({
      context: input.context,
      membershipId: record.claimMembershipId,
      scheduledShiftId: record.scheduledShiftId,
      jobId: record.jobId,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
    });
    await getDb().transaction(async (transaction) => {
      const [filled] = await transaction
        .update(staffShiftCoverRequests)
        .set({
          status: "FILLED",
          reviewedAt: new Date(),
          reviewedByUserId: input.actor.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffShiftCoverRequests.id, input.requestId),
            eq(staffShiftCoverRequests.status, "OPEN"),
          ),
        )
        .returning({ id: staffShiftCoverRequests.id });
      if (!filled) {
        throw new StaffShiftCoverError("This cover request was already filled.", 409);
      }
      await transaction
        .update(staffScheduledShifts)
        .set({
          membershipId: record.claimMembershipId,
          availabilityOverrideReason: eligibility.withinAvailability
            ? null
            : "Staff volunteered to cover this shift.",
          updatedAt: new Date(),
        })
        .where(eq(staffScheduledShifts.id, record.scheduledShiftId));
      await transaction
        .update(staffShiftCoverClaims)
        .set({ status: "DECLINED", updatedAt: new Date() })
        .where(
          and(
            eq(staffShiftCoverClaims.requestId, input.requestId),
            eq(staffShiftCoverClaims.status, "PENDING"),
          ),
        );
      await transaction
        .update(staffShiftCoverClaims)
        .set({ status: "APPROVED", updatedAt: new Date() })
        .where(eq(staffShiftCoverClaims.id, record.claimId));
    });
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: `staff_shift_cover.${parsed.status.toLowerCase()}`,
    entityType: "staff_shift_cover_claim",
    entityId: record.claimId,
  });
  return getManagerShiftCoverBoard(input.context);
}
