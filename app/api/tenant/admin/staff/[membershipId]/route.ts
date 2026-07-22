import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getTenantAdminSnapshot,
  updateStaffMembership,
} from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> },
) {
  try {
    const session = await requireStaffPermission("staff.manage");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { membershipId } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const membership = await updateStaffMembership(
      tenantContext,
      membershipId,
      await request.json(),
    );

    if (!membership) {
      return NextResponse.json({ error: "Staff membership not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.staff.update",
      entityType: "membership",
      entityId: membership.id,
      metadata: {
        userId: membership.userId,
        role: membership.role,
        isActive: membership.isActive,
      },
    });

    return NextResponse.json(await getTenantAdminSnapshot(tenantContext));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update staff user." },
      { status: 500 },
    );
  }
}
