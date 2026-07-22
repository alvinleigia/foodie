import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { companyAdminRoles } from "@/lib/role-access";
import {
  getCompanyOperationalReport,
  getCompanyRestaurantBreakdown,
  getCompanySummary,
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
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = getReportRange(request);
  const reportsEntitlement = await getOrganizationFeatureEntitlement(
    session.user.organizationId,
    "reports.operational",
  );
  const [summary, breakdown, report] = await Promise.all([
    getCompanySummary(session.user.organizationId),
    reportsEntitlement.enabled
      ? getCompanyRestaurantBreakdown(session.user.organizationId)
      : Promise.resolve([]),
    reportsEntitlement.enabled
      ? getCompanyOperationalReport(session.user.organizationId, range)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ summary, breakdown, report });
}
