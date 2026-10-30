import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  createStockTransfer,
  getInventoryStockTransferConfiguration,
  InventoryStockTransferConflictError,
  InventoryStockTransferNotFoundError,
} from "@/lib/inventory-stock-transfer";
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
      await getInventoryStockTransferConfiguration(context),
    );
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof InventoryStockTransferNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load stock transfers.",
      },
      { status: 500 },
    );
  }
}

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
    const configuration = await createStockTransfer(
      context,
      await request.json(),
      session.user.id,
    );
    const transfer = configuration.transfers[0] ?? null;
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "inventory.stock_transfer.create",
      entityType: "inventory_stock_transfer",
      entityId: transfer?.id ?? null,
      metadata: {
        reference: transfer?.reference ?? null,
        destinationOrganizationId:
          transfer?.destinationOrganizationId ?? null,
        lineCount: transfer?.lines.length ?? 0,
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
            : "Failed to create stock transfer.",
      },
      { status: 500 },
    );
  }
}
