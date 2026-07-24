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
import { getRestaurantTaxDefinitions } from "@/lib/restaurant-tax-definitions";

export async function GET() {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const [
      categories,
      currency,
      tags,
      modifierGroups,
      prepStations,
      taxConfiguration,
    ] = await Promise.all([
      getAdminMenu(tenantContext),
      getTenantMenuCurrency(tenantContext),
      getActiveMenuTags(),
      getMenuModifierGroups(tenantContext),
      getPrepStations(tenantContext),
      getRestaurantTaxDefinitions(tenantContext.organizationId),
    ]);
    return NextResponse.json({
      categories,
      currency,
      modifierGroups,
      prepStations,
      tags,
      taxDefinitions:
        taxConfiguration?.definitions.filter((definition) => definition.isActive) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch admin menu." },
      { status: 500 },
    );
  }
}
