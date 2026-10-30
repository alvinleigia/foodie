import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  cancelStaffTimeOffRequest,
  StaffTimeOffError,
} from "@/lib/staff-time-off";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffTimeOffCancelSchema } from "@/lib/validations/staff-schedule";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }

  if (error instanceof StaffTimeOffError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: "The time-off request could not be cancelled." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ requestId: string }> },
) {
  const session = await requireStaffPermission("staff_schedule.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    staffTimeOffCancelSchema.parse(await request.json());
    const context = await getCurrentTenantContext();
    const { requestId } = await routeContext.params;
    return NextResponse.json(
      await cancelStaffTimeOffRequest({
        actor: session.user,
        context,
        requestId,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
