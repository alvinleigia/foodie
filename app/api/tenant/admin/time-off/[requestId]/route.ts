import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  reviewStaffTimeOffRequest,
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
    { error: "The time-off request could not be reviewed." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ requestId: string }> },
) {
  const session = await requireStaffPermission("staff_schedule.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const { requestId } = await routeContext.params;
    return NextResponse.json(
      await reviewStaffTimeOffRequest({
        actor: session.user,
        context,
        payload: await request.json(),
        requestId,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
