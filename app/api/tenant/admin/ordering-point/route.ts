import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireRole } from "@/lib/auth";
import {
  getTenantAdminSnapshot,
  updateOrderingPointSettings,
} from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const tenantAdminRoles = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
] as const;

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole([...tenantAdminRoles]);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const orderingPoint = await updateOrderingPointSettings(
      tenantContext,
      await request.json(),
    );

    if (!orderingPoint) {
      return NextResponse.json({ error: "Ordering point not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.ordering_point.update",
      entityType: "ordering_point",
      entityId: orderingPoint.id,
      metadata: {
        name: orderingPoint.name,
        label: orderingPoint.label,
        qrSlug: orderingPoint.qrSlug,
        isActive: orderingPoint.isActive,
      },
    });

    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update ordering point.",
      },
      { status: 500 },
    );
  }
}
