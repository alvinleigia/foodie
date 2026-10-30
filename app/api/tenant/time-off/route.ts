import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  createStaffTimeOffRequest,
  StaffTimeOffError,
} from "@/lib/staff-time-off";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }

  if (error instanceof StaffTimeOffError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: "The time-off request could not be saved." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("staff_schedule.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    return NextResponse.json(
      await createStaffTimeOffRequest({
        actor: session.user,
        context,
        payload: await request.json(),
      }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
