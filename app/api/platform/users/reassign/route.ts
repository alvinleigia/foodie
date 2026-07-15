import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { PlanLimitError } from "@/lib/billing";
import { platformAdminRoles } from "@/lib/role-access";
import { reassignExistingUser } from "@/lib/saas-admin";

export async function POST(request: Request) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reassignExistingUser(await request.json());

    await writeAuditLog({
      actor: session.user,
      organizationId: result.membership.organizationId,
      action: "platform.user.reassign",
      entityType: "membership",
      entityId: result.membership.id,
      metadata: {
        userId: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.membership.role,
        deactivatedMembershipCount: result.deactivatedMembershipCount,
        targetOrganizationId: result.targetOrganization.id,
        targetOrganizationName: result.targetOrganization.name,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof PlanLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reassign user.",
      },
      { status: 500 },
    );
  }
}
