import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getStaffScheduleConfiguration,
  saveStaffScheduledShift,
  StaffScheduleError,
} from "@/lib/staff-schedule";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function scheduleErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }

  if (error instanceof StaffScheduleError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to save shift." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await requireStaffPermission("staff_schedule.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  return NextResponse.json(await getStaffScheduleConfiguration(context));
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("staff_schedule.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const scheduledShiftId = await saveStaffScheduledShift(
      await request.json(),
      {
        context,
        createdByMembershipId: session.user.membershipId,
      },
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "staff_schedule.create",
      entityType: "staff_scheduled_shift",
      entityId: scheduledShiftId,
      metadata: {},
    });

    return NextResponse.json(await getStaffScheduleConfiguration(context), {
      status: 201,
    });
  } catch (error) {
    return scheduleErrorResponse(error);
  }
}
