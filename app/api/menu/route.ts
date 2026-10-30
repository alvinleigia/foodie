import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
  getOrganizationFeatureEntitlement,
} from "@/lib/feature-entitlements";
import { getPublicMenu, getTenantMenuCurrency } from "@/lib/menu";
import { getRestaurantBusinessDate } from "@/lib/order-number";
import { getResolvedRestaurantTaxes } from "@/lib/restaurant-taxes";
import {
  getPublicTenantContextFromRequest,
  StaffRestaurantContextError,
} from "@/lib/tenant-context";

export async function GET(request: Request) {
  try {
    const [tenantContext, session] = await Promise.all([
      getPublicTenantContextFromRequest(request),
      auth().catch(() => null),
    ]);

    if (session?.user.kind !== "staff") {
      await assertOrganizationFeatureEnabled(
        tenantContext.organizationId,
        "ordering.customer",
      );
    }

    const [inventoryEntitlement, currency, businessDate] = await Promise.all([
      getOrganizationFeatureEntitlement(
        tenantContext.organizationId,
        "operations.inventory",
      ),
      getTenantMenuCurrency(tenantContext),
      getRestaurantBusinessDate(getDb(), tenantContext),
    ]);
    const categories = await getPublicMenu(tenantContext, {
      includeInventory: inventoryEntitlement.enabled,
    });
    const resolvedTaxes = await getResolvedRestaurantTaxes(
      tenantContext.organizationId,
      categories.flatMap((category) => category.items.map((item) => item.id)),
      businessDate,
    );
    const taxPricing = {
      pricingMode: resolvedTaxes.pricingMode,
      taxRateBps: 0,
      taxesByMenuItemId: Object.fromEntries(resolvedTaxes.taxesByMenuItemId),
      taxOverridesByFulfilmentType: Object.fromEntries(
        [...resolvedTaxes.taxOverridesByFulfilmentType].map(
          ([fulfilmentType, taxesByMenuItemId]) => [
            fulfilmentType,
            Object.fromEntries(taxesByMenuItemId),
          ],
        ),
      ),
    };

    return NextResponse.json({ categories, currency, taxPricing });
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
