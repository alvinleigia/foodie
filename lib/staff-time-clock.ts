import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  restaurantJobs,
  staffJobAssignments,
  staffScheduledShifts,
  staffShiftBreaks,
  staffShifts,
  users,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import { getBusinessDateRange } from "@/lib/business-date";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import { getUpcomingTimeClockSchedule } from "@/lib/staff-schedule";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";
import type {
  StaffShiftRecord,
  StaffTimeClockJob,
  StaffTimeClockSnapshot,
} from "@/types/staff-time-clock";

type StaffTimeClockActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  name?: string | null;
  username?: string;
};

type ShiftRow = {
  id: string;
  membershipId: string;
  staffName: string;
  jobId: string;
  jobName: string;
  scheduledShiftId: string | null;
  clockedInAt: Date;
  clockedOutAt: Date | null;
  hourlyRateMinor: number | null;
  payCurrency: string | null;
  approvalStatus: "PENDING" | "APPROVED";
  approvedAt: Date | null;
  approvedByName: string | null;
};

type BreakRow = {
  staffShiftId: string;
  startedAt: Date;
  endedAt: Date | null;
};

export type StaffShiftRecordFilters = {
  from?: string;
  query?: string;
  status?: "ACTIVE" | "APPROVED" | "PENDING";
  to?: string;
};

export class StaffTimeClockError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffTimeClockError";
    this.status = status;
  }
}

function isUniqueViolation(error: unknown) {
  return hasPostgresErrorCode(error, "23505");
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function serializeShiftRows(
  shifts: ShiftRow[],
  breaks: BreakRow[],
  now = new Date(),
): StaffShiftRecord[] {
  const breaksByShift = new Map<string, BreakRow[]>();

  for (const shiftBreak of breaks) {
    const current = breaksByShift.get(shiftBreak.staffShiftId) ?? [];
    current.push(shiftBreak);
    breaksByShift.set(shiftBreak.staffShiftId, current);
  }

  return shifts.map((shift) => {
    const shiftEnd = shift.clockedOutAt ?? now;
    const shiftBreaks = breaksByShift.get(shift.id) ?? [];
    const breakMinutes = shiftBreaks.reduce(
      (total, shiftBreak) =>
        total + minutesBetween(shiftBreak.startedAt, shiftBreak.endedAt ?? now),
      0,
    );
    const durationMinutes = minutesBetween(shift.clockedInAt, shiftEnd);
    const workedMinutes = Math.max(0, durationMinutes - breakMinutes);
    const openBreak = shiftBreaks.find((shiftBreak) => !shiftBreak.endedAt);

    return {
      id: shift.id,
      membershipId: shift.membershipId,
      staffName: shift.staffName,
      jobId: shift.jobId,
      jobName: shift.jobName,
      scheduledShiftId: shift.scheduledShiftId,
      clockedInAt: shift.clockedInAt.toISOString(),
      clockedOutAt: shift.clockedOutAt?.toISOString() ?? null,
      breakStartedAt: openBreak?.startedAt.toISOString() ?? null,
      breakMinutes,
      durationMinutes,
      workedMinutes,
      hourlyRateMinor: shift.hourlyRateMinor,
      payCurrency: shift.payCurrency,
      grossPayMinor:
        shift.hourlyRateMinor == null
          ? null
          : Math.round((shift.hourlyRateMinor * workedMinutes) / 60),
      approvalStatus: shift.approvalStatus,
      approvedAt: shift.approvedAt?.toISOString() ?? null,
      approvedByName: shift.approvedByName,
    };
  });
}

async function getShiftBreaks(
  shiftIds: string[],
  context: TenantContext,
) {
  if (!shiftIds.length) {
    return [];
  }

  return getDb()
    .select({
      staffShiftId: staffShiftBreaks.staffShiftId,
      startedAt: staffShiftBreaks.startedAt,
      endedAt: staffShiftBreaks.endedAt,
    })
    .from(staffShiftBreaks)
    .where(
      and(
        eq(staffShiftBreaks.organizationId, context.organizationId),
        inArray(staffShiftBreaks.staffShiftId, shiftIds),
      ),
    )
    .orderBy(asc(staffShiftBreaks.startedAt));
}

async function getStaffShiftRows(
  context: TenantContext,
  options: {
    filters?: StaffShiftRecordFilters;
    membershipId?: string;
    shiftId?: string;
    shiftIds?: string[];
    limit: number;
  },
) {
  const filters = options.filters;
  const normalizedQuery = filters?.query?.trim();
  let from: Date | undefined;
  let to: Date | undefined;

  if (filters?.from || filters?.to) {
    const [organization] = await getDb()
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, context.organizationId))
      .limit(1);

    if (!organization) {
      throw new StaffTimeClockError("Restaurant not found.", 404);
    }

    from = filters.from
      ? getBusinessDateRange(filters.from, organization.timezone).start
      : undefined;
    to = filters.to
      ? getBusinessDateRange(filters.to, organization.timezone).end
      : undefined;
  }

  return getDb()
    .select({
      id: staffShifts.id,
      membershipId: staffShifts.membershipId,
      staffName: users.name,
      jobId: staffShifts.jobId,
      jobName: staffShifts.jobNameSnapshot,
      scheduledShiftId: staffShifts.scheduledShiftId,
      clockedInAt: staffShifts.clockedInAt,
      clockedOutAt: staffShifts.clockedOutAt,
      hourlyRateMinor: staffShifts.hourlyRateMinorSnapshot,
      payCurrency: staffShifts.payCurrencySnapshot,
      approvalStatus: sql<"PENDING" | "APPROVED">`${staffShifts.approvalStatus}`,
      approvedAt: staffShifts.approvedAt,
      approvedByName: staffShifts.approvedByNameSnapshot,
    })
    .from(staffShifts)
    .innerJoin(
      memberships,
      and(
        eq(memberships.id, staffShifts.membershipId),
        eq(memberships.organizationId, staffShifts.organizationId),
      ),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(staffShifts.organizationId, context.organizationId),
        ...(options.membershipId
          ? [eq(staffShifts.membershipId, options.membershipId)]
          : []),
        ...(options.shiftId ? [eq(staffShifts.id, options.shiftId)] : []),
        ...(options.shiftIds?.length
          ? [inArray(staffShifts.id, options.shiftIds)]
          : []),
        ...(from ? [gte(staffShifts.clockedInAt, from)] : []),
        ...(to ? [lt(staffShifts.clockedInAt, to)] : []),
        ...(filters?.status === "ACTIVE"
          ? [isNull(staffShifts.clockedOutAt)]
          : filters?.status === "APPROVED"
            ? [eq(staffShifts.approvalStatus, "APPROVED")]
            : filters?.status === "PENDING"
              ? [
                  isNotNull(staffShifts.clockedOutAt),
                  eq(staffShifts.approvalStatus, "PENDING"),
                ]
              : []),
        ...(normalizedQuery
          ? [
              or(
                ilike(users.name, `%${normalizedQuery}%`),
                ilike(staffShifts.jobNameSnapshot, `%${normalizedQuery}%`),
              ),
            ]
          : []),
      ),
    )
    .orderBy(desc(staffShifts.clockedInAt))
    .limit(options.limit);
}

export async function getStaffTimeClockSnapshot(
  membershipId: string,
  context: TenantContext,
): Promise<StaffTimeClockSnapshot> {
  const db = getDb();
  const [assignedJobs, shifts, upcomingScheduledShifts] = await Promise.all([
    db
      .select({
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
        and(
          eq(staffJobAssignments.organizationId, context.organizationId),
          eq(staffJobAssignments.membershipId, membershipId),
        ),
      )
      .orderBy(desc(staffJobAssignments.isPrimary), asc(restaurantJobs.sortOrder)),
    getStaffShiftRows(context, { membershipId, limit: 10 }),
    getUpcomingTimeClockSchedule(membershipId, context),
  ]);
  const breaks = await getShiftBreaks(
    shifts.map((shift) => shift.id),
    context,
  );
  const records = serializeShiftRows(shifts, breaks);

  return {
    assignedJobs: assignedJobs satisfies StaffTimeClockJob[],
    activeShift: records.find((shift) => !shift.clockedOutAt) ?? null,
    upcomingScheduledShifts,
    recentShifts: records.filter((shift) => shift.clockedOutAt),
  };
}

export async function getRestaurantStaffShiftRecords(
  context: TenantContext,
  limit = 100,
  filters?: StaffShiftRecordFilters,
) {
  const shifts = await getStaffShiftRows(context, {
    filters,
    limit: Math.max(1, Math.min(limit, 200)),
  });
  const breaks = await getShiftBreaks(
    shifts.map((shift) => shift.id),
    context,
  );

  return serializeShiftRows(shifts, breaks);
}

export async function getApprovedStaffShiftRecordsForExport(
  context: TenantContext,
  filters?: Omit<StaffShiftRecordFilters, "status">,
) {
  const shifts = await getStaffShiftRows(context, {
    filters: { ...filters, status: "APPROVED" },
    limit: 5000,
  });
  const approvedShifts = shifts.filter(
    (shift) => shift.approvalStatus === "APPROVED" && shift.clockedOutAt,
  );
  const breaks = await getShiftBreaks(
    approvedShifts.map((shift) => shift.id),
    context,
  );

  return serializeShiftRows(approvedShifts, breaks);
}

export async function setStaffShiftApproval(input: {
  actor: StaffTimeClockActor;
  approved: boolean;
  context: TenantContext;
  shiftId: string;
}) {
  const [shift] = await getDb()
    .select({
      id: staffShifts.id,
      clockedOutAt: staffShifts.clockedOutAt,
      approvalStatus: staffShifts.approvalStatus,
    })
    .from(staffShifts)
    .where(
      and(
        eq(staffShifts.id, input.shiftId),
        eq(staffShifts.organizationId, input.context.organizationId),
      ),
    )
    .limit(1);

  if (!shift) {
    throw new StaffTimeClockError("Staff shift not found.", 404);
  }

  if (!shift.clockedOutAt) {
    throw new StaffTimeClockError(
      "Clock out before approving this timesheet.",
      409,
    );
  }

  const targetStatus = input.approved ? "APPROVED" : "PENDING";

  if (shift.approvalStatus !== targetStatus) {
    await getDb()
      .update(staffShifts)
      .set(
        input.approved
          ? {
              approvalStatus: "APPROVED",
              approvedAt: new Date(),
              approvedByUserId: input.actor.id,
              approvedByNameSnapshot:
                input.actor.name ?? input.actor.username ?? "Manager",
              updatedAt: new Date(),
            }
          : {
              approvalStatus: "PENDING",
              approvedAt: null,
              approvedByUserId: null,
              approvedByNameSnapshot: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(staffShifts.id, input.shiftId),
          eq(staffShifts.organizationId, input.context.organizationId),
        ),
      );

    await writeAuditLog({
      actor: input.actor,
      organizationId: input.context.organizationId,
      action: input.approved
        ? "staff_shift.timesheet_approve"
        : "staff_shift.timesheet_reopen",
      entityType: "staff_shift",
      entityId: input.shiftId,
    });
  }

  const [updatedShift] = await getStaffShiftRows(input.context, {
    shiftId: input.shiftId,
    limit: 1,
  });

  if (!updatedShift) {
    throw new StaffTimeClockError("Staff shift not found.", 404);
  }

  const breaks = await getShiftBreaks([updatedShift.id], input.context);
  const [record] = serializeShiftRows([updatedShift], breaks);

  return record;
}

export async function setStaffShiftApprovals(input: {
  actor: StaffTimeClockActor;
  approved: boolean;
  context: TenantContext;
  shiftIds: string[];
}) {
  const shiftIds = [...new Set(input.shiftIds)];
  const shifts = await getStaffShiftRows(input.context, {
    shiftIds,
    limit: shiftIds.length,
  });

  if (shifts.length !== shiftIds.length) {
    throw new StaffTimeClockError("One or more staff shifts were not found.", 404);
  }

  if (shifts.some((shift) => !shift.clockedOutAt)) {
    throw new StaffTimeClockError(
      "Clock out every selected shift before approving timesheets.",
      409,
    );
  }

  const targetStatus = input.approved ? "APPROVED" : "PENDING";
  const changedShiftIds = shifts
    .filter((shift) => shift.approvalStatus !== targetStatus)
    .map((shift) => shift.id);

  if (changedShiftIds.length) {
    await getDb()
      .update(staffShifts)
      .set(
        input.approved
          ? {
              approvalStatus: "APPROVED",
              approvedAt: new Date(),
              approvedByUserId: input.actor.id,
              approvedByNameSnapshot:
                input.actor.name ?? input.actor.username ?? "Manager",
              updatedAt: new Date(),
            }
          : {
              approvalStatus: "PENDING",
              approvedAt: null,
              approvedByUserId: null,
              approvedByNameSnapshot: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(staffShifts.organizationId, input.context.organizationId),
          inArray(staffShifts.id, changedShiftIds),
        ),
      );

    await writeAuditLog({
      actor: input.actor,
      organizationId: input.context.organizationId,
      action: input.approved
        ? "staff_shift.timesheet_bulk_approve"
        : "staff_shift.timesheet_bulk_reopen",
      entityType: "staff_shift_batch",
      metadata: { shiftIds: changedShiftIds },
    });
  }

  const updatedShifts = await getStaffShiftRows(input.context, {
    shiftIds,
    limit: shiftIds.length,
  });
  const breaks = await getShiftBreaks(
    updatedShifts.map((shift) => shift.id),
    input.context,
  );

  return serializeShiftRows(updatedShifts, breaks);
}

function csvEscape(value: unknown) {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

export function approvedStaffShiftsToCsv(shifts: StaffShiftRecord[]) {
  const approvedShifts = shifts.filter(
    (shift) => shift.approvalStatus === "APPROVED" && shift.clockedOutAt,
  );
  const headers = [
    "staff_name",
    "job",
    "clocked_in_at",
    "clocked_out_at",
    "duration_minutes",
    "break_minutes",
    "worked_minutes",
    "worked_hours",
    "hourly_rate",
    "currency",
    "gross_pay",
    "approved_at",
    "approved_by",
  ];
  const rows = approvedShifts.map((shift) =>
    [
      shift.staffName,
      shift.jobName,
      shift.clockedInAt,
      shift.clockedOutAt,
      shift.durationMinutes,
      shift.breakMinutes,
      shift.workedMinutes,
      (shift.workedMinutes / 60).toFixed(2),
      shift.hourlyRateMinor == null
        ? null
        : (shift.hourlyRateMinor / 100).toFixed(2),
      shift.payCurrency,
      shift.grossPayMinor == null
        ? null
        : (shift.grossPayMinor / 100).toFixed(2),
      shift.approvedAt,
      shift.approvedByName,
    ]
      .map(csvEscape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

async function getOpenShift(membershipId: string, context: TenantContext) {
  const [shift] = await getDb()
    .select()
    .from(staffShifts)
    .where(
      and(
        eq(staffShifts.organizationId, context.organizationId),
        eq(staffShifts.membershipId, membershipId),
        isNull(staffShifts.clockedOutAt),
      ),
    )
    .limit(1);

  return shift ?? null;
}

export async function clockInStaff(input: {
  actor: StaffTimeClockActor;
  context: TenantContext;
  jobId: string;
  scheduledShiftId?: string;
  note?: string | null;
}) {
  const [job] = await getDb()
    .select({
      id: restaurantJobs.id,
      name: restaurantJobs.name,
      hourlyRateMinor: staffJobAssignments.hourlyRateMinor,
      currency: organizations.currency,
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
    .innerJoin(
      organizations,
      eq(organizations.id, staffJobAssignments.organizationId),
    )
    .where(
      and(
        eq(staffJobAssignments.organizationId, input.context.organizationId),
        eq(staffJobAssignments.membershipId, input.actor.membershipId),
        eq(staffJobAssignments.jobId, input.jobId),
      ),
    )
    .limit(1);

  if (!job) {
    throw new StaffTimeClockError("Choose an active job assigned to you.", 409);
  }

  if (input.scheduledShiftId) {
    const [scheduledShift] = await getDb()
      .select({ id: staffScheduledShifts.id })
      .from(staffScheduledShifts)
      .where(
        and(
          eq(staffScheduledShifts.id, input.scheduledShiftId),
          eq(
            staffScheduledShifts.organizationId,
            input.context.organizationId,
          ),
          eq(
            staffScheduledShifts.membershipId,
            input.actor.membershipId,
          ),
          eq(staffScheduledShifts.jobId, input.jobId),
          eq(staffScheduledShifts.status, "PUBLISHED"),
        ),
      )
      .limit(1);

    if (!scheduledShift) {
      throw new StaffTimeClockError(
        "The selected scheduled shift is no longer available.",
        409,
      );
    }
  }

  let shift: typeof staffShifts.$inferSelect;

  try {
    const [created] = await getDb()
      .insert(staffShifts)
      .values({
        organizationId: input.context.organizationId,
        membershipId: input.actor.membershipId,
        jobId: job.id,
        scheduledShiftId: input.scheduledShiftId ?? null,
        jobNameSnapshot: job.name,
        hourlyRateMinorSnapshot: job.hourlyRateMinor,
        payCurrencySnapshot: job.hourlyRateMinor == null ? null : job.currency,
        clockInNote: input.note ?? null,
        updatedAt: new Date(),
      })
      .returning();
    shift = created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StaffTimeClockError("You are already clocked in.", 409);
    }

    throw error;
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift.clock_in",
    entityType: "staff_shift",
    entityId: shift.id,
    metadata: { jobId: job.id, jobName: job.name },
  });
}

export async function startStaffBreak(input: {
  actor: StaffTimeClockActor;
  context: TenantContext;
}) {
  const shift = await getOpenShift(input.actor.membershipId, input.context);

  if (!shift) {
    throw new StaffTimeClockError("Clock in before starting a break.", 409);
  }

  let shiftBreak: typeof staffShiftBreaks.$inferSelect;

  try {
    const [created] = await getDb()
      .insert(staffShiftBreaks)
      .values({
        organizationId: input.context.organizationId,
        staffShiftId: shift.id,
        updatedAt: new Date(),
      })
      .returning();
    shiftBreak = created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StaffTimeClockError("A break is already in progress.", 409);
    }

    throw error;
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift.break_start",
    entityType: "staff_shift_break",
    entityId: shiftBreak.id,
    metadata: { staffShiftId: shift.id },
  });
}

export async function endStaffBreak(input: {
  actor: StaffTimeClockActor;
  context: TenantContext;
}) {
  const shift = await getOpenShift(input.actor.membershipId, input.context);

  if (!shift) {
    throw new StaffTimeClockError("No active shift was found.", 409);
  }

  const now = new Date();
  const [endedBreak] = await getDb()
    .update(staffShiftBreaks)
    .set({ endedAt: now, updatedAt: now })
    .where(
      and(
        eq(staffShiftBreaks.organizationId, input.context.organizationId),
        eq(staffShiftBreaks.staffShiftId, shift.id),
        isNull(staffShiftBreaks.endedAt),
      ),
    )
    .returning();

  if (!endedBreak) {
    throw new StaffTimeClockError("No break is currently in progress.", 409);
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift.break_end",
    entityType: "staff_shift_break",
    entityId: endedBreak.id,
    metadata: { staffShiftId: shift.id },
  });
}

export async function clockOutStaff(input: {
  actor: StaffTimeClockActor;
  context: TenantContext;
  note?: string | null;
}) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [shift] = await tx
      .select()
      .from(staffShifts)
      .where(
        and(
          eq(staffShifts.organizationId, input.context.organizationId),
          eq(staffShifts.membershipId, input.actor.membershipId),
          isNull(staffShifts.clockedOutAt),
        ),
      )
      .limit(1);

    if (!shift) {
      throw new StaffTimeClockError("No active shift was found.", 409);
    }

    const now = new Date();
    const endedBreaks = await tx
      .update(staffShiftBreaks)
      .set({ endedAt: now, updatedAt: now })
      .where(
        and(
          eq(staffShiftBreaks.organizationId, input.context.organizationId),
          eq(staffShiftBreaks.staffShiftId, shift.id),
          isNull(staffShiftBreaks.endedAt),
        ),
      )
      .returning({ id: staffShiftBreaks.id });
    const [closedShift] = await tx
      .update(staffShifts)
      .set({
        clockedOutAt: now,
        clockOutNote: input.note ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(staffShifts.id, shift.id),
          eq(staffShifts.organizationId, input.context.organizationId),
          isNull(staffShifts.clockedOutAt),
        ),
      )
      .returning();

    if (!closedShift) {
      throw new StaffTimeClockError("This shift is already closed.", 409);
    }

    return { closedShift, endedBreakCount: endedBreaks.length };
  });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.context.organizationId,
    action: "staff_shift.clock_out",
    entityType: "staff_shift",
    entityId: result.closedShift.id,
    metadata: {
      endedOpenBreak: result.endedBreakCount > 0,
      jobId: result.closedShift.jobId,
      jobName: result.closedShift.jobNameSnapshot,
    },
  });
}
