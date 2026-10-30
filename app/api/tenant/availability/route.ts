import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  saveStaffWeeklyAvailability,
  StaffAvailabilityError,
} from "@/lib/staff-availability";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }

  if (error instanceof StaffAvailabilityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: "Weekly availability could not be saved." },
    { status: 500 },
  );
}

export async function PUT(request: Request) {
  const session = await requireStaffPermission("staff_schedule.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    return NextResponse.json(
      await saveStaffWeeklyAvailability({
        actor: session.user,
        context,
        payload: await request.json(),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
