import { requireStaffPermission } from "@/lib/auth";
import {
  approvedStaffShiftsToCsv,
  getApprovedStaffShiftRecordsForExport,
} from "@/lib/staff-time-clock";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffTimesheetExportFiltersSchema } from "@/lib/validations/staff-timesheet";

export async function GET(request: Request) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = staffTimesheetExportFiltersSchema.safeParse({
    from: searchParams.get("from") || undefined,
    query: searchParams.get("query") || undefined,
    to: searchParams.get("to") || undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const context = await getCurrentTenantContext();
  const shifts = await getApprovedStaffShiftRecordsForExport(
    context,
    parsed.data,
  );

  return new Response(approvedStaffShiftsToCsv(shifts), {
    headers: {
      "Content-Disposition": 'attachment; filename="approved-timesheets.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
