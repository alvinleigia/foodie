import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import {
  CashDrawerCloseReportError,
  exportCashDrawerCloseReportCsv,
  getCashDrawerCloseReport,
} from "@/lib/cash-drawer-close-reports";
import { logError } from "@/lib/logger";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET(request: Request) {
  try {
    const session = await requireStaffPermission("reports.view");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const tenantContext = await getCurrentTenantContext();
    const report = await getCashDrawerCloseReport({
      businessDate: url.searchParams.get("date") ?? undefined,
      organizationId: tenantContext.organizationId,
    });

    if (url.searchParams.get("format") === "csv") {
      return new Response(exportCashDrawerCloseReportCsv(report), {
        headers: {
          "Content-Disposition": `attachment; filename="cash-close-${report.businessDate}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof CashDrawerCloseReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError("cash_drawer_close_report_failed", error);

    return NextResponse.json(
      { error: "Cash close report could not be generated." },
      { status: 500 },
    );
  }
}
