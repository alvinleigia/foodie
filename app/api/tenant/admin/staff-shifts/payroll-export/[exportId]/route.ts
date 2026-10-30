import { requireStaffPermission } from "@/lib/auth";
import {
  getStaffPayrollExportDownload,
  StaffPayrollExportError,
} from "@/lib/staff-payroll";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET(
  _request: Request,
  routeContext: { params: Promise<{ exportId: string }> },
) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const { exportId } = await routeContext.params;
    const payrollExport = await getStaffPayrollExportDownload(exportId, context);

    return new Response(payrollExport.csv, {
      headers: {
        "Content-Disposition": `attachment; filename="payroll-${payrollExport.periodFrom}-${payrollExport.periodTo}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof StaffPayrollExportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "The payroll export could not be downloaded." },
      { status: 500 },
    );
  }
}
