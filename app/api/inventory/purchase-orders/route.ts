import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  createPurchaseOrder,
  InventoryProcurementNotFoundError,
} from "@/lib/inventory-procurement";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: Request) {
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
    const body = await request.json();
    const configuration = await createPurchaseOrder(
      context,
      body,
      session.user.id,
    );
    const purchaseOrder = configuration.purchaseOrders[0] ?? null;
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "inventory.purchase_order.create",
      entityType: "inventory_purchase_order",
      entityId: purchaseOrder?.id ?? null,
      metadata: {
        reference: purchaseOrder?.reference ?? null,
        supplierName: purchaseOrder?.supplierName ?? null,
        lineCount: purchaseOrder?.lines.length ?? 0,
      },
    });
    return NextResponse.json(configuration, { status: 201 });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof InventoryProcurementNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create purchase order.",
      },
      { status: 500 },
    );
  }
}
