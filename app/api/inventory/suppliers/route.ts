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
  saveInventorySupplier,
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
    const configuration = await saveInventorySupplier(context, body);
    const supplier = body?.id
      ? configuration.suppliers.find((item) => item.id === body.id)
      : configuration.suppliers.find(
          (item) =>
            item.name.toLowerCase() ===
            String(body?.name ?? "").trim().toLowerCase(),
        );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: body?.id ? "inventory.supplier.update" : "inventory.supplier.create",
      entityType: "inventory_supplier",
      entityId: supplier?.id ?? null,
      metadata: {
        name: supplier?.name ?? null,
        isActive: supplier?.isActive ?? null,
      },
    });
    return NextResponse.json(configuration, { status: body?.id ? 200 : 201 });
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
      { error: error instanceof Error ? error.message : "Failed to save supplier." },
      { status: 500 },
    );
  }
}
