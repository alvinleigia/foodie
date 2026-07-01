import { NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { getActiveMenuTags, getAdminMenu, getTenantMenuCurrency } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const [categories, currency, tags] = await Promise.all([
      getAdminMenu(tenantContext),
      getTenantMenuCurrency(tenantContext),
      getActiveMenuTags(),
    ]);
    return NextResponse.json({ categories, currency, tags });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch admin menu." },
      { status: 500 },
    );
  }
}
