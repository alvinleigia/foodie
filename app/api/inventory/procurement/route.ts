import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { getInventoryProcurementConfiguration } from "@/lib/inventory-procurement";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffPermission("inventory.manage");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const context = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      context.organizationId,
      "operations.inventory",
    );
    return NextResponse.json(
      await getInventoryProcurementConfiguration(context),
    );
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load procurement.",
      },
      { status: 500 },
    );
  }
}
