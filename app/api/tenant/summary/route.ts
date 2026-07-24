import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { getRestaurantSummary } from "@/lib/saas-reports";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffPermission("restaurant.dashboard");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const summary = await getRestaurantSummary(tenantContext.organizationId);

    return NextResponse.json({ summary });
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
