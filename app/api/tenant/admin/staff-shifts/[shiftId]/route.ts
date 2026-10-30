import { NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  setStaffShiftApproval,
  StaffTimeClockError,
} from "@/lib/staff-time-clock";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const approvalSchema = z.object({ approved: z.boolean() });

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ shiftId: string }> },
) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = approvalSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getCurrentTenantContext();
    const { shiftId } = await routeContext.params;
    const shift = await setStaffShiftApproval({
      actor: session.user,
      approved: parsed.data.approved,
      context,
      shiftId,
    });

    return NextResponse.json({ shift });
  } catch (error) {
    if (error instanceof StaffTimeClockError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "The timesheet approval could not be updated." },
      { status: 500 },
    );
  }
}
