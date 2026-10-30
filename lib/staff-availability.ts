import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { memberships, staffWeeklyAvailability } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";
import { staffWeeklyAvailabilitySchema } from "@/lib/validations/staff-schedule";
import type {
  StaffAvailabilityDay,
  StaffWeeklyAvailability,
} from "@/types/staff-schedule";

type AvailabilityActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  username?: string;
};

export class StaffAvailabilityError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffAvailabilityError";
    this.status = status;
  }
}

function serializeAvailability(
  days: StaffAvailabilityDay[],
): StaffWeeklyAvailability {
  return {
    configured: days.length === 7,
    days: [...days].sort((left, right) => left.dayOfWeek - right.dayOfWeek),
  };
}

export async function getStaffWeeklyAvailability(
  membershipId: string,
  context: TenantContext,
) {
  const rows = await getDb()
    .select({
      dayOfWeek: staffWeeklyAvailability.dayOfWeek,
      isAvailable: staffWeeklyAvailability.isAvailable,
      startsMinute: staffWeeklyAvailability.startsMinute,
      endsMinute: staffWeeklyAvailability.endsMinute,
    })
    .from(staffWeeklyAvailability)
    .where(
      and(
        eq(staffWeeklyAvailability.organizationId, context.organizationId),
        eq(staffWeeklyAvailability.membershipId, membershipId),
      ),
    )
    .orderBy(asc(staffWeeklyAvailability.dayOfWeek));

  return serializeAvailability(rows);
}

export async function getStaffWeeklyAvailabilityMap(
  membershipIds: string[],
  context: TenantContext,
) {
  if (!membershipIds.length) {
    return new Map<string, StaffWeeklyAvailability>();
  }

  const rows = await getDb()
    .select({
      membershipId: staffWeeklyAvailability.membershipId,
      dayOfWeek: staffWeeklyAvailability.dayOfWeek,
      isAvailable: staffWeeklyAvailability.isAvailable,
      startsMinute: staffWeeklyAvailability.startsMinute,
      endsMinute: staffWeeklyAvailability.endsMinute,
    })
    .from(staffWeeklyAvailability)
    .where(
      and(
        eq(staffWeeklyAvailability.organizationId, context.organizationId),
        inArray(staffWeeklyAvailability.membershipId, membershipIds),
      ),
    )
    .orderBy(
      asc(staffWeeklyAvailability.membershipId),
      asc(staffWeeklyAvailability.dayOfWeek),
    );

  return new Map(
    membershipIds.map((membershipId) => [
      membershipId,
      serializeAvailability(
        rows
          .filter((row) => row.membershipId === membershipId)
          .map((row) => ({
            dayOfWeek: row.dayOfWeek,
            isAvailable: row.isAvailable,
            startsMinute: row.startsMinute,
            endsMinute: row.endsMinute,
          })),
      ),
    ]),
  );
}

export async function saveStaffWeeklyAvailability(input: {
  actor: AvailabilityActor;
  context: TenantContext;
  payload: unknown;
}) {
  const parsed = staffWeeklyAvailabilitySchema.parse(input.payload);
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
    throw new StaffAvailabilityError("Active staff membership not found.", 404);
  }

  await getDb().transaction(async (transaction) => {
    await transaction
      .delete(staffWeeklyAvailability)
      .where(
        and(
          eq(staffWeeklyAvailability.organizationId, input.context.organizationId),
          eq(staffWeeklyAvailability.membershipId, input.actor.membershipId),
        ),
      );
    await transaction.insert(staffWeeklyAvailability).values(
      parsed.days.map((day) => ({
        organizationId: input.context.organizationId,
        membershipId: input.actor.membershipId,
        ...day,
      })),
    );
  });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_availability.update",
    entityType: "staff_weekly_availability",
    entityId: input.actor.membershipId,
  });

  return getStaffWeeklyAvailability(input.actor.membershipId, input.context);
}

function minuteOfDay(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dayOfWeek(value: string) {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

export async function isShiftWithinStaffAvailability(input: {
  context: TenantContext;
  endsAt: string;
  membershipId: string;
  startsAt: string;
}) {
  const availability = await getStaffWeeklyAvailability(
    input.membershipId,
    input.context,
  );

  if (!availability.configured) return true;

  const startsOn = input.startsAt.slice(0, 10);
  const endsOn = input.endsAt.slice(0, 10);
  const startsMinute = minuteOfDay(input.startsAt.slice(11));
  let endsMinute = minuteOfDay(input.endsAt.slice(11));

  if (startsOn !== endsOn) {
    const startsDate = new Date(`${startsOn}T00:00:00Z`);
    const endsDate = new Date(`${endsOn}T00:00:00Z`);
    const dayDifference =
      (endsDate.getTime() - startsDate.getTime()) / (24 * 60 * 60_000);

    if (dayDifference !== 1 || endsMinute !== 0) return false;
    endsMinute = 1440;
  }

  const day = availability.days.find(
    (item) => item.dayOfWeek === dayOfWeek(startsOn),
  );

  return Boolean(
    day?.isAvailable &&
      day.startsMinute !== null &&
      day.endsMinute !== null &&
      startsMinute >= day.startsMinute &&
      endsMinute <= day.endsMinute,
  );
}
