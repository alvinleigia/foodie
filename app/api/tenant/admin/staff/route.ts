import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { PlanLimitError } from "@/lib/billing";
import { createStaffUser, getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const tenantAdminRoles = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole([...tenantAdminRoles]);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const staff = await createStaffUser(tenantContext, await request.json());
    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: tenantContext.locationId,
      action: "restaurant.staff.create",
      entityType: "membership",
      entityId: staff.membership.id,
      metadata: {
        userId: staff.user.id,
        username: staff.user.username,
        role: staff.membership.role,
        isActive: staff.membership.isActive,
      },
    });

    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof PlanLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create staff user." },
      { status: 500 },
    );
  }
}
