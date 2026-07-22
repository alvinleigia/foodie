import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getInventoryRecords, upsertInventoryItem } from "@/lib/inventory";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffPermission("inventory.manage");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "operations.inventory",
    );
    const inventory = await getInventoryRecords(tenantContext);

    return NextResponse.json({ inventory });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch inventory." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffPermission("inventory.manage");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "operations.inventory",
    );
    const body = await request.json();
    const inventory = await upsertInventoryItem(tenantContext, body);

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "inventory.item.upsert",
      entityType: "inventory_item",
      entityId:
        body && typeof body === "object" && "menuItemId" in body
          ? String(body.menuItemId)
          : null,
      metadata: {
        menuItemId:
          body && typeof body === "object" && "menuItemId" in body
            ? body.menuItemId
            : null,
        currentQuantity:
          body && typeof body === "object" && "currentQuantity" in body
            ? body.currentQuantity
            : null,
        lowStockThreshold:
          body && typeof body === "object" && "lowStockThreshold" in body
            ? body.lowStockThreshold
            : null,
        isTracked:
          body && typeof body === "object" && "isTracked" in body
            ? body.isTracked
            : null,
      },
    });

    return NextResponse.json({ inventory });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save inventory." },
      { status: 500 },
    );
  }
}
