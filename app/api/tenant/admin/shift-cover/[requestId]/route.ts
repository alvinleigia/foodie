import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  cancelStaffShiftCoverRequest,
  reviewStaffShiftCoverClaim,
  StaffShiftCoverError,
} from "@/lib/staff-shift-cover";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffShiftCoverCancelSchema } from "@/lib/validations/staff-schedule";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }
  if (error instanceof StaffShiftCoverError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: "The shift-cover review could not be completed." },
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
    const payload = await request.json();
    const { requestId } = await routeContext.params;
    const context = await getCurrentTenantContext();
    if (staffShiftCoverCancelSchema.safeParse(payload).success) {
      return NextResponse.json(
        await cancelStaffShiftCoverRequest({
          actor: session.user,
          context,
          manager: true,
          requestId,
        }),
      );
    }
    return NextResponse.json(
      await reviewStaffShiftCoverClaim({
        actor: session.user,
        context,
        payload,
        requestId,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
