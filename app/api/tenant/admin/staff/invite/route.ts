import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { PlanLimitError } from "@/lib/billing";
import {
  createRestaurantAdminStaffInvitation,
  InvitationConflictError,
} from "@/lib/invitations";
import { restaurantAdminRoles } from "@/lib/role-access";
import { getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: Request) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const origin = new URL(request.url).origin;
    const invitation = await createRestaurantAdminStaffInvitation(
      tenantContext,
      await request.json(),
      origin,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: tenantContext.locationId,
      action: "restaurant.staff.invite",
      entityType: "staff_invitation",
      entityId: invitation.invitation.id,
      metadata: {
        userId: invitation.user.id,
        membershipId: invitation.membership.id,
        role: invitation.membership.role,
        username: invitation.user.username,
      },
    });

    return NextResponse.json({
      ...(await getTenantAdminSnapshot(tenantContext)),
      inviteUrl: invitation.inviteUrl,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof InvitationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof PlanLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invitation." },
      { status: 500 },
    );
  }
}
