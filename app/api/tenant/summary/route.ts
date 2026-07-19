import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { restaurantAdminRoles } from "@/lib/role-access";
import {
  getRestaurantOperationalReport,
  getRestaurantSummary,
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const range = getReportRange(request);
    const reportsEntitlement = await getOrganizationFeatureEntitlement(
      tenantContext.organizationId,
      "reports.operational",
    );
    const [summary, report] = await Promise.all([
      getRestaurantSummary(tenantContext.organizationId),
      reportsEntitlement.enabled
        ? getRestaurantOperationalReport(tenantContext.organizationId, range)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ summary, report });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch restaurant summary.",
      },
      { status: 500 },
    );
  }
}
