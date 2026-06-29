import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { companyAdminRoles } from "@/lib/role-access";
import { updateCompanyUserMembership } from "@/lib/saas-admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { membershipId } = await context.params;
    const membership = await updateCompanyUserMembership(
      session.user.organizationId,
      membershipId,
      await request.json(),
    );

    if (!membership) {
      return NextResponse.json(
        { error: "User membership not found for this company." },
        { status: 404 },
      );
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: session.user.organizationId,
      action: "company.user_access.update",
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
          error instanceof Error ? error.message : "Failed to update user access.",
      },
      { status: 500 },
    );
  }
}
