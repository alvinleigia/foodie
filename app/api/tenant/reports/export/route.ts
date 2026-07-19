import { requireRole } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { restaurantAdminRoles } from "@/lib/role-access";
import {
  exportOperationalReportCsv,
  getRestaurantOperationalReport,
  type ReportRange,
} from "@/lib/saas-reports";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function getReportRange(request: Request): ReportRange {
  const value = new URL(request.url).searchParams.get("range");

  if (value === "today" || value === "7d" || value === "30d" || value === "all") {
    return value;
  }

  return "30d";
}

export async function GET(request: Request) {
  try {
    const session = await requireRole([...restaurantAdminRoles]);

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "reports.operational",
    );
    const range = getReportRange(request);
    const report = await getRestaurantOperationalReport(
      tenantContext.organizationId,
      range,
    );
    const csv = exportOperationalReportCsv(
      report,
      "Restaurant operational report",
    );

    return new Response(csv, {
      headers: {
        "Content-Disposition": `attachment; filename="restaurant-operational-report-${range}.csv"`,
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
          error instanceof Error
            ? error.message
            : "Failed to export restaurant report.",
      },
      { status: 500 },
    );
  }
}
