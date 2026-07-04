import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createChildRestaurantStaffInvitation,
  InvitationConflictError,
} from "@/lib/invitations";
import { companyAdminRoles } from "@/lib/role-access";
import { listCompanyRestaurants } from "@/lib/saas-admin";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const body = await request.json();

    if (!body.locationId || typeof body.locationId !== "string") {
      return NextResponse.json(
        { error: "Choose a location before inviting staff." },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;
    const invitation = await createChildRestaurantStaffInvitation(
      session.user.organizationId,
      id,
      body.locationId,
      body,
      origin,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      locationId: body.locationId,
      action: "company.restaurant_staff.invite",
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
      restaurants: await listCompanyRestaurants(session.user.organizationId),
      inviteUrl: invitation.inviteUrl,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof InvitationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create restaurant staff.",
      },
      { status: 500 },
    );
  }
}
