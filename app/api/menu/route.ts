import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
  getOrganizationFeatureEntitlement,
} from "@/lib/feature-entitlements";
import { getPublicMenu, getTenantMenuCurrency } from "@/lib/menu";
import {
  getPublicTenantContextFromRequest,
  StaffRestaurantContextError,
} from "@/lib/tenant-context";

export async function GET(request: Request) {
  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    const session = await auth().catch(() => null);

    if (session?.user.kind !== "staff") {
      await assertOrganizationFeatureEnabled(
        tenantContext.organizationId,
        "ordering.customer",
      );
    }

    const inventoryEntitlement = await getOrganizationFeatureEntitlement(
      tenantContext.organizationId,
      "operations.inventory",
    );

    const [categories, currency] = await Promise.all([
      getPublicMenu(tenantContext, {
        includeInventory: inventoryEntitlement.enabled,
      }),
      getTenantMenuCurrency(tenantContext),
    ]);
    return NextResponse.json({ categories, currency });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch menu." },
      { status: error instanceof StaffRestaurantContextError ? error.status : 500 },
    );
  }
}
