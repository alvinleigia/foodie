import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createCompanyStaffInvitation,
  InvitationConflictError,
} from "@/lib/invitations";
import { platformAdminRoles } from "@/lib/role-access";
import { listPlatformCompanies } from "@/lib/saas-admin";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const origin = new URL(request.url).origin;
    const invitation = await createCompanyStaffInvitation(
      id,
      await request.json(),
      origin,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "platform.company_staff.invite",
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
      companies: await listPlatformCompanies(),
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
      { error: error instanceof Error ? error.message : "Failed to create company staff." },
      { status: 500 },
    );
  }
}
