import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  InventoryStockTransferConflictError,
  InventoryStockTransferNotFoundError,
  updateStockTransfer,
} from "@/lib/inventory-stock-transfer";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PUT(
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
    const configuration = await updateStockTransfer(
      context,
      id,
      await request.json(),
    );
    const transfer = configuration.transfers.find((item) => item.id === id);
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "inventory.stock_transfer.update",
      entityType: "inventory_stock_transfer",
      entityId: id,
      metadata: {
        reference: transfer?.reference ?? null,
        destinationOrganizationId:
          transfer?.destinationOrganizationId ?? null,
        lineCount: transfer?.lines.length ?? 0,
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
    if (error instanceof InventoryStockTransferConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InventoryStockTransferNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update stock transfer.",
      },
      { status: 500 },
    );
  }
}
