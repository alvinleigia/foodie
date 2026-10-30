import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { getRestaurantStaffShiftRecords } from "@/lib/staff-time-clock";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffTimesheetFiltersSchema } from "@/lib/validations/staff-timesheet";

export async function GET(request: Request) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = staffTimesheetFiltersSchema.safeParse({
    from: searchParams.get("from") || undefined,
    query: searchParams.get("query") || undefined,
    status: searchParams.get("status") || undefined,
    to: searchParams.get("to") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const context = await getCurrentTenantContext();
  const shifts = await getRestaurantStaffShiftRecords(
    context,
    200,
    parsed.data,
  );

  return NextResponse.json({ shifts });
}
