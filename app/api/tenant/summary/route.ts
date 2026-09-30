import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { getRestaurantSummary } from "@/lib/saas-reports";
import { getRestaurantCustomerOrderEntry } from "@/lib/tenant-domains";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffPermission("restaurant.dashboard");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const canManageOrderingPoint = session.user.permissions.includes(
      "ordering_point.manage",
    );
    const [summary, customerOrdering] = await Promise.all([
      getRestaurantSummary(tenantContext.organizationId),
      canManageOrderingPoint
        ? getRestaurantCustomerOrderEntry(tenantContext.organizationId)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ customerOrdering, summary });
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
