import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  cancelStaffScheduledShift,
  getStaffScheduleConfiguration,
  saveStaffScheduledShift,
  StaffScheduleError,
} from "@/lib/staff-schedule";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffScheduledShiftStatusSchema } from "@/lib/validations/staff-schedule";

function scheduleErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }

  if (error instanceof StaffScheduleError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to update shift." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ scheduledShiftId: string }> },
) {
  const session = await requireStaffPermission("staff_schedule.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const { scheduledShiftId } = await routeContext.params;
    const payload = await request.json();
    const statusResult = staffScheduledShiftStatusSchema.safeParse(payload);
    const action = statusResult.success ? "cancel" : "update";

    if (statusResult.success) {
      await cancelStaffScheduledShift(scheduledShiftId, context);
    } else {
      await saveStaffScheduledShift(payload, {
        context,
        createdByMembershipId: session.user.membershipId,
        scheduledShiftId,
      });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: `staff_schedule.${action}`,
      entityType: "staff_scheduled_shift",
      entityId: scheduledShiftId,
      metadata: {},
    });

    return NextResponse.json(await getStaffScheduleConfiguration(context));
  } catch (error) {
    return scheduleErrorResponse(error);
  }
}
