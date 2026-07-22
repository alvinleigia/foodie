import { NextResponse } from "next/server";

import { requireAnyStaffPermission } from "@/lib/auth";
import { getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireAnyStaffPermission([
      "ordering_point.manage",
      "restaurant.settings",
      "staff.manage",
    ]);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tenant admin data." },
      { status: 500 },
    );
  }
}
