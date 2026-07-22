import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getTenantAdminSnapshot,
  updateOrganizationSettings,
} from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaffPermission("restaurant.settings");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const organization = await updateOrganizationSettings(
      tenantContext,
      await request.json(),
    );

    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: organization.id,
      action: "restaurant.organization.update",
      entityType: "organization",
      entityId: organization.id,
      metadata: {
        name: organization.name,
        logoUrl: organization.logoUrl,
        timezone: organization.timezone,
        currency: organization.currency,
        customerCancellationFeeBps:
          organization.customerCancellationFeeBps,
      },
    });

    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update organization." },
      { status: 500 },
    );
  }
}
