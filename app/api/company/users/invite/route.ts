import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createCompanyStaffInvitation,
  InvitationConflictError,
} from "@/lib/invitations";
import { companyAdminRoles } from "@/lib/role-access";

export async function POST(request: Request) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const invitation = await createCompanyStaffInvitation(
      session.user.organizationId,
      await request.json(),
      origin,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: session.user.organizationId,
      action: "company.user.invite",
      entityType: "staff_invitation",
      entityId: invitation.invitation.id,
      metadata: {
        userId: invitation.user.id,
        membershipId: invitation.membership.id,
        role: invitation.membership.role,
        username: invitation.user.username,
      },
    });

    return NextResponse.json({ inviteUrl: invitation.inviteUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof InvitationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to invite user." },
      { status: 500 },
    );
  }
}
