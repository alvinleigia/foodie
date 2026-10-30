import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  cancelStaffShiftCoverRequest,
  StaffShiftCoverError,
  withdrawStaffShiftCoverClaim,
} from "@/lib/staff-shift-cover";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import {
  staffShiftCoverCancelSchema,
  staffShiftCoverWithdrawSchema,
} from "@/lib/validations/staff-schedule";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }
  if (error instanceof StaffShiftCoverError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: "The shift-cover action could not be completed." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ recordId: string }> },
) {
  const session = await requireStaffPermission("staff_schedule.view");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const { recordId } = await routeContext.params;
    const context = await getCurrentTenantContext();
    if (staffShiftCoverCancelSchema.safeParse(payload).success) {
      return NextResponse.json(
        await cancelStaffShiftCoverRequest({
          actor: session.user,
          context,
          manager: false,
          requestId: recordId,
        }),
      );
    }
    staffShiftCoverWithdrawSchema.parse(payload);
    return NextResponse.json(
      await withdrawStaffShiftCoverClaim({
        actor: session.user,
        claimId: recordId,
        context,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
