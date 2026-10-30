import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { logError } from "@/lib/logger";
import {
  clockInStaff,
  clockOutStaff,
  endStaffBreak,
  getStaffTimeClockSnapshot,
  StaffTimeClockError,
  startStaffBreak,
} from "@/lib/staff-time-clock";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffTimeClockActionSchema } from "@/lib/validations/staff-time-clock";

function errorResponse(error: unknown) {
  if (error instanceof StaffTimeClockError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  logError("staff_time_clock_failed", error);
  return NextResponse.json(
    { error: "The time clock action could not be completed." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await requireStaffPermission("time_clock.use");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    return NextResponse.json(
      await getStaffTimeClockSnapshot(session.user.membershipId, context),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("time_clock.use");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = staffTimeClockActionSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getCurrentTenantContext();

    switch (parsed.data.action) {
      case "CLOCK_IN":
        await clockInStaff({
          actor: session.user,
          context,
          jobId: parsed.data.jobId,
          scheduledShiftId: parsed.data.scheduledShiftId,
          note: parsed.data.note,
        });
        break;
      case "START_BREAK":
        await startStaffBreak({ actor: session.user, context });
        break;
      case "END_BREAK":
        await endStaffBreak({ actor: session.user, context });
        break;
      case "CLOCK_OUT":
        await clockOutStaff({
          actor: session.user,
          context,
          note: parsed.data.note,
        });
        break;
    }

    return NextResponse.json(
      await getStaffTimeClockSnapshot(session.user.membershipId, context),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
