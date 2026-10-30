import "server-only";

import { and, asc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  staffScheduledShifts,
  staffTimeOffRequests,
  users,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import { toUtcDateTime } from "@/lib/business-date";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";
import {
  staffTimeOffRequestSchema,
  staffTimeOffReviewSchema,
} from "@/lib/validations/staff-schedule";
import type { StaffTimeOffRecord } from "@/types/staff-schedule";

type TimeOffActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  name?: string | null;
  username?: string;
};

export class StaffTimeOffError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffTimeOffError";
    this.status = status;
  }
}

function serialize(row: {
  id: string;
  membershipId: string;
  staffName: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
  reviewNote: string | null;
}): StaffTimeOffRecord {
  return row;
}

async function getRows(
  context: TenantContext,
  membershipId?: string,
) {
  return getDb()
    .select({
      id: staffTimeOffRequests.id,
      membershipId: staffTimeOffRequests.membershipId,
      staffName: users.name,
      startsOn: staffTimeOffRequests.startsOn,
      endsOn: staffTimeOffRequests.endsOn,
      reason: staffTimeOffRequests.reason,
      status: staffTimeOffRequests.status,
      reviewNote: staffTimeOffRequests.reviewNote,
    })
    .from(staffTimeOffRequests)
    .innerJoin(
      memberships,
      and(
        eq(memberships.id, staffTimeOffRequests.membershipId),
        eq(memberships.organizationId, staffTimeOffRequests.organizationId),
      ),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(staffTimeOffRequests.organizationId, context.organizationId),
        ...(membershipId
          ? [eq(staffTimeOffRequests.membershipId, membershipId)]
          : []),
      ),
    )
    .orderBy(asc(staffTimeOffRequests.startsOn))
    .limit(200);
}

export async function getStaffTimeOffRequests(context: TenantContext) {
  const rows = await getRows(context);
  return rows.map((row) => serialize({
    ...row,
    status: row.status as StaffTimeOffRecord["status"],
  }));
}

export async function getPersonalStaffTimeOffRequests(
  membershipId: string,
  context: TenantContext,
) {
  const rows = await getRows(context, membershipId);
  return rows.map((row) => serialize({
    ...row,
    status: row.status as StaffTimeOffRecord["status"],
  }));
}

export async function createStaffTimeOffRequest(input: {
  actor: TimeOffActor;
  context: TenantContext;
  payload: unknown;
}) {
  const parsed = staffTimeOffRequestSchema.parse(input.payload);
  const [membership] = await getDb()
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, input.actor.membershipId),
        eq(memberships.organizationId, input.context.organizationId),
        eq(memberships.isActive, true),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new StaffTimeOffError("Active staff membership not found.", 404);
  }

  const [overlap] = await getDb()
    .select({ id: staffTimeOffRequests.id })
    .from(staffTimeOffRequests)
    .where(
      and(
        eq(staffTimeOffRequests.organizationId, input.context.organizationId),
        eq(staffTimeOffRequests.membershipId, input.actor.membershipId),
        inArray(staffTimeOffRequests.status, ["PENDING", "APPROVED"]),
        lte(staffTimeOffRequests.startsOn, parsed.endsOn),
        gte(staffTimeOffRequests.endsOn, parsed.startsOn),
      ),
    )
    .limit(1);

  if (overlap) {
    throw new StaffTimeOffError(
      "An open time-off request already overlaps these dates.",
      409,
    );
  }

  const [created] = await getDb()
    .insert(staffTimeOffRequests)
    .values({
      organizationId: input.context.organizationId,
      membershipId: input.actor.membershipId,
      startsOn: parsed.startsOn,
      endsOn: parsed.endsOn,
      reason: parsed.reason,
    })
    .returning({ id: staffTimeOffRequests.id });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_time_off.request",
    entityType: "staff_time_off_request",
    entityId: created.id,
  });

  return getPersonalStaffTimeOffRequests(
    input.actor.membershipId,
    input.context,
  );
}

export async function cancelStaffTimeOffRequest(input: {
  actor: TimeOffActor;
  context: TenantContext;
  requestId: string;
}) {
  const [cancelled] = await getDb()
    .update(staffTimeOffRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(staffTimeOffRequests.id, input.requestId),
        eq(staffTimeOffRequests.organizationId, input.context.organizationId),
        eq(staffTimeOffRequests.membershipId, input.actor.membershipId),
        inArray(staffTimeOffRequests.status, ["PENDING", "APPROVED"]),
      ),
    )
    .returning({ id: staffTimeOffRequests.id });

  if (!cancelled) {
    throw new StaffTimeOffError("Time-off request cannot be cancelled.", 409);
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_time_off.cancel",
    entityType: "staff_time_off_request",
    entityId: input.requestId,
  });

  return getPersonalStaffTimeOffRequests(
    input.actor.membershipId,
    input.context,
  );
}

export async function reviewStaffTimeOffRequest(input: {
  actor: TimeOffActor;
  context: TenantContext;
  payload: unknown;
  requestId: string;
}) {
  const parsed = staffTimeOffReviewSchema.parse(input.payload);

  if (parsed.status === "APPROVED") {
    const [request] = await getDb()
      .select({
        membershipId: staffTimeOffRequests.membershipId,
        startsOn: staffTimeOffRequests.startsOn,
        endsOn: staffTimeOffRequests.endsOn,
        timezone: organizations.timezone,
      })
      .from(staffTimeOffRequests)
      .innerJoin(
        organizations,
        eq(organizations.id, staffTimeOffRequests.organizationId),
      )
      .where(
        and(
          eq(staffTimeOffRequests.id, input.requestId),
          eq(staffTimeOffRequests.organizationId, input.context.organizationId),
          eq(staffTimeOffRequests.status, "PENDING"),
        ),
      )
      .limit(1);

    if (!request) {
      throw new StaffTimeOffError(
        "Only pending time-off requests can be reviewed.",
        409,
      );
    }

    const endExclusive = new Date(`${request.endsOn}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const endDate = endExclusive.toISOString().slice(0, 10);
    const startsAt = toUtcDateTime(`${request.startsOn}T00:00`, request.timezone);
    const endsAt = toUtcDateTime(`${endDate}T00:00`, request.timezone);
    const [scheduledShift] = await getDb()
      .select({ id: staffScheduledShifts.id })
      .from(staffScheduledShifts)
      .where(
        and(
          eq(staffScheduledShifts.organizationId, input.context.organizationId),
          eq(staffScheduledShifts.membershipId, request.membershipId),
          eq(staffScheduledShifts.status, "PUBLISHED"),
          lt(staffScheduledShifts.startsAt, endsAt),
          gt(staffScheduledShifts.endsAt, startsAt),
        ),
      )
      .limit(1);

    if (scheduledShift) {
      throw new StaffTimeOffError(
        "Cancel the overlapping published shift before approving this request.",
        409,
      );
    }
  }

  const [reviewed] = await getDb()
    .update(staffTimeOffRequests)
    .set({
      status: parsed.status,
      reviewNote: parsed.reviewNote,
      reviewedAt: new Date(),
      reviewedByUserId: input.actor.id,
      reviewedByNameSnapshot:
        input.actor.name ?? input.actor.username ?? "Manager",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(staffTimeOffRequests.id, input.requestId),
        eq(staffTimeOffRequests.organizationId, input.context.organizationId),
        eq(staffTimeOffRequests.status, "PENDING"),
      ),
    )
    .returning({ id: staffTimeOffRequests.id });

  if (!reviewed) {
    throw new StaffTimeOffError(
      "Only pending time-off requests can be reviewed.",
      409,
    );
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: `staff_time_off.${parsed.status.toLowerCase()}`,
    entityType: "staff_time_off_request",
    entityId: input.requestId,
  });

  return getStaffTimeOffRequests(input.context);
}

export async function hasApprovedTimeOffConflict(input: {
  context: TenantContext;
  endsOn: string;
  membershipId: string;
  startsOn: string;
}) {
  const [conflict] = await getDb()
    .select({ id: staffTimeOffRequests.id })
    .from(staffTimeOffRequests)
    .where(
      and(
        eq(staffTimeOffRequests.organizationId, input.context.organizationId),
        eq(staffTimeOffRequests.membershipId, input.membershipId),
        eq(staffTimeOffRequests.status, "APPROVED"),
        lte(staffTimeOffRequests.startsOn, input.endsOn),
        gte(staffTimeOffRequests.endsOn, input.startsOn),
      ),
    )
    .limit(1);

  return Boolean(conflict);
}
