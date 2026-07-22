import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
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
    const session = await requireStaffPermission("reports.view");

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "reports.operational",
    );
    const report = await getRestaurantOperationalReport(
      tenantContext.organizationId,
      getReportRange(request),
    );

    return Response.json({ report });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch restaurant report.",
      },
      { status: 500 },
    );
  }
}
