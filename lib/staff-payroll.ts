import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  staffPayrollExportEntries,
  staffPayrollExportRuns,
  staffPayrollProfiles,
} from "@/db/schema";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import {
  getApprovedStaffShiftRecordsForExport,
  type StaffShiftRecordFilters,
} from "@/lib/staff-time-clock";
import type { TenantContext } from "@/lib/tenant-context";
import type { StaffPayrollExportRun } from "@/types/staff-payroll";

type StaffPayrollActor = {
  id: string;
  name?: string | null;
  username?: string;
};

export class StaffPayrollExportError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "StaffPayrollExportError";
    this.status = status;
  }
}

function csvEscape(value: unknown) {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

export async function createGenericPayrollExport(
  context: TenantContext,
  filters?: Omit<StaffShiftRecordFilters, "status">,
) {
  const shifts = await getApprovedStaffShiftRecordsForExport(context, filters);

  if (!shifts.length) {
    throw new StaffPayrollExportError(
      "No approved timesheets were found for this payroll period.",
    );
  }

  const membershipIds = [...new Set(shifts.map((shift) => shift.membershipId))];
  const profiles = await getDb()
    .select({
      membershipId: staffPayrollProfiles.membershipId,
      employeeReference: staffPayrollProfiles.employeeReference,
    })
    .from(staffPayrollProfiles)
    .where(
      and(
        eq(staffPayrollProfiles.organizationId, context.organizationId),
        inArray(staffPayrollProfiles.membershipId, membershipIds),
      ),
    );
  const referenceByMembershipId = new Map(
    profiles.map((profile) => [profile.membershipId, profile.employeeReference]),
  );
  const missingReferences = [
    ...new Set(
      shifts
        .filter((shift) => !referenceByMembershipId.has(shift.membershipId))
        .map((shift) => shift.staffName),
    ),
  ];

  if (missingReferences.length) {
    throw new StaffPayrollExportError(
      `Add a payroll employee reference for: ${missingReferences.join(", ")}.`,
    );
  }

  const missingRates = [
    ...new Set(
      shifts
        .filter(
          (shift) =>
            shift.hourlyRateMinor == null ||
            shift.grossPayMinor == null ||
            !shift.payCurrency,
        )
        .map((shift) => shift.staffName),
    ),
  ];

  if (missingRates.length) {
    throw new StaffPayrollExportError(
      `The approved shifts for ${missingRates.join(", ")} do not have a captured pay rate. Set the rate before their next clock-in.`,
    );
  }

  const currencies = [
    ...new Set(shifts.map((shift) => shift.payCurrency).filter(Boolean)),
  ];

  if (currencies.length !== 1) {
    throw new StaffPayrollExportError(
      "A payroll export must contain exactly one currency.",
    );
  }

  const headers = [
    "employee_reference",
    "staff_name",
    "job",
    "clocked_in_at",
    "clocked_out_at",
    "worked_minutes",
    "worked_hours",
    "hourly_rate",
    "currency",
    "gross_pay",
  ];
  const rows = shifts.map((shift) =>
    [
      referenceByMembershipId.get(shift.membershipId),
      shift.staffName,
      shift.jobName,
      shift.clockedInAt,
      shift.clockedOutAt,
      shift.workedMinutes,
      (shift.workedMinutes / 60).toFixed(2),
      ((shift.hourlyRateMinor ?? 0) / 100).toFixed(2),
      shift.payCurrency,
      ((shift.grossPayMinor ?? 0) / 100).toFixed(2),
    ]
      .map(csvEscape)
      .join(","),
  );

  return {
    csv: [headers.join(","), ...rows].join("\n"),
    currency: currencies[0] as string,
    grossPayMinor: shifts.reduce(
      (total, shift) => total + (shift.grossPayMinor ?? 0),
      0,
    ),
    rowCount: rows.length,
    shiftIds: shifts.map((shift) => shift.id),
  };
}

function serializeExportRun(
  run: typeof staffPayrollExportRuns.$inferSelect,
): StaffPayrollExportRun {
  return {
    id: run.id,
    provider: run.provider as "GENERIC_CSV",
    periodFrom: run.periodFrom,
    periodTo: run.periodTo,
    rowCount: run.rowCount,
    currency: run.currency,
    grossPayMinor: run.grossPayMinor,
    generatedByName: run.generatedByNameSnapshot,
    createdAt: run.createdAt.toISOString(),
  };
}

export async function createStaffPayrollExportRun(input: {
  actor: StaffPayrollActor;
  context: TenantContext;
  from: string;
  query?: string;
  to: string;
}) {
  const payrollExport = await createGenericPayrollExport(input.context, {
    from: input.from,
    query: input.query,
    to: input.to,
  });
  const generatedByName = input.actor.name ?? input.actor.username ?? "Manager";

  try {
    const run = await getDb().transaction(async (tx) => {
      const exportedShifts = await tx
        .select({ shiftId: staffPayrollExportEntries.staffShiftId })
        .from(staffPayrollExportEntries)
        .where(
          and(
            eq(
              staffPayrollExportEntries.organizationId,
              input.context.organizationId,
            ),
            inArray(
              staffPayrollExportEntries.staffShiftId,
              payrollExport.shiftIds,
            ),
          ),
        )
        .limit(1);

      if (exportedShifts.length) {
        throw new StaffPayrollExportError(
          "One or more approved shifts are already included in a payroll export.",
        );
      }

      const [created] = await tx
        .insert(staffPayrollExportRuns)
        .values({
          organizationId: input.context.organizationId,
          provider: "GENERIC_CSV",
          periodFrom: input.from,
          periodTo: input.to,
          rowCount: payrollExport.rowCount,
          currency: payrollExport.currency,
          grossPayMinor: payrollExport.grossPayMinor,
          csvContent: payrollExport.csv,
          generatedByUserId: input.actor.id,
          generatedByNameSnapshot: generatedByName,
        })
        .returning();

      await tx.insert(staffPayrollExportEntries).values(
        payrollExport.shiftIds.map((staffShiftId) => ({
          organizationId: input.context.organizationId,
          exportRunId: created.id,
          staffShiftId,
        })),
      );

      return created;
    });

    return {
      run: serializeExportRun(run),
      csv: payrollExport.csv,
    };
  } catch (error) {
    if (error instanceof StaffPayrollExportError) throw error;
    if (hasPostgresErrorCode(error, "23505")) {
      throw new StaffPayrollExportError(
        "One or more approved shifts are already included in a payroll export.",
      );
    }
    throw error;
  }
}

export async function getStaffPayrollExportRuns(
  context: TenantContext,
  limit = 20,
): Promise<StaffPayrollExportRun[]> {
  const runs = await getDb()
    .select()
    .from(staffPayrollExportRuns)
    .where(eq(staffPayrollExportRuns.organizationId, context.organizationId))
    .orderBy(desc(staffPayrollExportRuns.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));

  return runs.map(serializeExportRun);
}

export async function getStaffPayrollExportDownload(
  exportId: string,
  context: TenantContext,
) {
  const [run] = await getDb()
    .select({
      csv: staffPayrollExportRuns.csvContent,
      periodFrom: staffPayrollExportRuns.periodFrom,
      periodTo: staffPayrollExportRuns.periodTo,
    })
    .from(staffPayrollExportRuns)
    .where(
      and(
        eq(staffPayrollExportRuns.id, exportId),
        eq(staffPayrollExportRuns.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    throw new StaffPayrollExportError("Payroll export not found.", 404);
  }

  return run;
}
