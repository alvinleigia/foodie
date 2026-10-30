import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createStaffPayrollExportRun,
  StaffPayrollExportError,
} from "@/lib/staff-payroll";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffPayrollExportSchema } from "@/lib/validations/staff-timesheet";

export async function POST(request: Request) {
  const session = await requireStaffPermission("time_clock.manage");

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = staffPayrollExportSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getCurrentTenantContext();
    const payrollExport = await createStaffPayrollExportRun({
      actor: session.user,
      context,
      ...parsed.data,
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "staff_payroll.export",
      entityType: "staff_payroll_export",
      metadata: {
        ...parsed.data,
        exportRunId: payrollExport.run.id,
        currency: payrollExport.run.currency,
        grossPayMinor: payrollExport.run.grossPayMinor,
        rowCount: payrollExport.run.rowCount,
      },
    });

    return Response.json({ run: payrollExport.run }, { status: 201 });
  } catch (error) {
    if (error instanceof StaffPayrollExportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "The payroll export could not be generated." },
      { status: 500 },
    );
  }
}
