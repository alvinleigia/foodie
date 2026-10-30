import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  claimStaffShiftCover,
  createStaffShiftCoverRequest,
  StaffShiftCoverError,
} from "@/lib/staff-shift-cover";
import { getCurrentTenantContext } from "@/lib/tenant-context";

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

export async function POST(request: Request) {
  const session = await requireStaffPermission("staff_schedule.view");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as { action?: string };
    const context = await getCurrentTenantContext();
    if (payload.action === "REQUEST") {
      return NextResponse.json(
        await createStaffShiftCoverRequest({
          actor: session.user,
          context,
          payload,
        }),
        { status: 201 },
      );
    }
    if (payload.action === "CLAIM") {
      return NextResponse.json(
        await claimStaffShiftCover({
          actor: session.user,
          context,
          payload,
        }),
        { status: 201 },
      );
    }
    return NextResponse.json({ error: "Invalid shift-cover action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
