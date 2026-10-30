import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import {
  setStaffShiftApprovals,
  StaffTimeClockError,
} from "@/lib/staff-time-clock";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffTimesheetBulkApprovalSchema } from "@/lib/validations/staff-timesheet";

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = staffTimesheetBulkApprovalSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getCurrentTenantContext();
    const shifts = await setStaffShiftApprovals({
      actor: session.user,
      approved: parsed.data.approved,
      context,
      shiftIds: parsed.data.shiftIds,
    });

    return NextResponse.json({ shifts });
  } catch (error) {
    if (error instanceof StaffTimeClockError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "The selected timesheets could not be updated." },
      { status: 500 },
    );
  }
}
