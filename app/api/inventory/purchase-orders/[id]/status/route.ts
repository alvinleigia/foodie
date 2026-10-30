import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  InventoryProcurementConflictError,
  InventoryProcurementNotFoundError,
  updatePurchaseOrderStatus,
} from "@/lib/inventory-procurement";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
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
    const { id } = await routeContext.params;
    const body = await request.json();
    const configuration = await updatePurchaseOrderStatus(context, id, body);
    const purchaseOrder = configuration.purchaseOrders.find(
      (item) => item.id === id,
    );
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action:
        body?.action === "ORDER"
          ? "inventory.purchase_order.place"
          : "inventory.purchase_order.cancel",
      entityType: "inventory_purchase_order",
      entityId: id,
      metadata: {
        reference: purchaseOrder?.reference ?? null,
        status: purchaseOrder?.status ?? null,
      },
    });
    return NextResponse.json(configuration);
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof InventoryProcurementConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InventoryProcurementNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update purchase order.",
      },
      { status: 500 },
    );
  }
}
