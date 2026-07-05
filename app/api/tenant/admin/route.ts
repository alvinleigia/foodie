import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const tenantAdminRoles = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
] as const;

export async function GET() {
  try {
    const session = await requireRole([...tenantAdminRoles]);

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
