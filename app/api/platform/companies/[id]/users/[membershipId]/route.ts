import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { platformAdminRoles } from "@/lib/role-access";
import { updateCompanyStaffMembership } from "@/lib/saas-admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; membershipId: string }> },
) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, membershipId } = await context.params;
    const membership = await updateCompanyStaffMembership(
      id,
      membershipId,
      await request.json(),
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Company user membership not found." },
        { status: 404 },
      );
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "platform.company_staff.update",
      entityType: "membership",
      entityId: membership.id,
      metadata: {
        userId: membership.userId,
        role: membership.role,
        isActive: membership.isActive,
      },
    });

    return NextResponse.json({ membership });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update company user.",
      },
      { status: 500 },
    );
  }
}
