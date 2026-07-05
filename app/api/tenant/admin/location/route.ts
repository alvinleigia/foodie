import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getTenantAdminSnapshot, updateLocationSettings } from "@/lib/tenant-admin";
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
    const location = await updateLocationSettings(tenantContext, await request.json());

    if (!location) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: location.id,
      action: "restaurant.location.update",
      entityType: "location",
      entityId: location.id,
      metadata: {
        name: location.name,
        label: location.label,
        qrSlug: location.qrSlug,
        timezone: location.timezone,
        isActive: location.isActive,
      },
    });

    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update location." },
      { status: 500 },
    );
  }
}
