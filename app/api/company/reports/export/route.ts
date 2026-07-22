import { requireRole } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { companyAdminRoles } from "@/lib/role-access";
import {
  exportOperationalReportCsv,
  getCompanyOperationalReport,
  type ReportRange,
} from "@/lib/saas-reports";

function getReportRange(request: Request): ReportRange {
  const value = new URL(request.url).searchParams.get("range");

  if (value === "today" || value === "7d" || value === "30d" || value === "all") {
    return value;
  }

  return "30d";
}

export async function GET(request: Request) {
  try {
    const session = await requireRole([...companyAdminRoles]);

    if (!session?.user.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertOrganizationFeatureEnabled(
      session.user.organizationId,
      "reports.operational",
    );
    const range = getReportRange(request);
    const report = await getCompanyOperationalReport(
      session.user.organizationId,
      range,
    );
    const csv = exportOperationalReportCsv(report, "Company operational report");

    return new Response(csv, {
      headers: {
        "Content-Disposition": `attachment; filename="company-operational-report-${range}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to export company report.",
      },
      { status: 500 },
    );
  }
}
