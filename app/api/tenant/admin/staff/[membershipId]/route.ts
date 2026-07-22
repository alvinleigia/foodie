import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getTenantAdminSnapshot,
  updateStaffMembership,
} from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { resolveStaffPermissions } from "@/lib/staff-permissions";
import { updateStaffMembershipSchema } from "@/lib/validations/tenant-admin";

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
    const input = updateStaffMembershipSchema.parse(await request.json());
    const effectivePermissions =
      input.permissions ?? resolveStaffPermissions(input.role, null);

    if (
      membershipId === session.user.membershipId &&
      (!input.isActive || !effectivePermissions.includes("staff.manage"))
    ) {
      return NextResponse.json(
        { error: "You cannot remove your own staff management access." },
        { status: 400 },
      );
    }

    const tenantContext = await getCurrentTenantContext();
    const membership = await updateStaffMembership(
      tenantContext,
      membershipId,
      input,
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
        permissions: resolveStaffPermissions(
          membership.role,
          membership.permissionOverrides,
        ),
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
