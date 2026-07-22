import { NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import {
  getActiveMenuTags,
  getAdminMenu,
  getMenuModifierGroups,
  getTenantMenuCurrency,
} from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { getPrepStations } from "@/lib/prep-stations";

export async function GET() {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const [categories, currency, tags, modifierGroups, prepStations] = await Promise.all([
      getAdminMenu(tenantContext),
      getTenantMenuCurrency(tenantContext),
      getActiveMenuTags(),
      getMenuModifierGroups(tenantContext),
      getPrepStations(tenantContext),
    ]);
    return NextResponse.json({ categories, currency, modifierGroups, prepStations, tags });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch admin menu." },
      { status: 500 },
    );
  }
}
