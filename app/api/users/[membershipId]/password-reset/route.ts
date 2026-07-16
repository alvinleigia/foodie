import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { createPasswordResetLink } from "@/lib/password-reset";
import {
  companyAdminRoles,
  platformAdminRoles,
  restaurantAdminRoles,
} from "@/lib/role-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const session = await requireRole([
    ...platformAdminRoles,
    ...companyAdminRoles,
    ...restaurantAdminRoles,
  ]);

  if (!session?.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { membershipId } = await context.params;
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const reset = await createPasswordResetLink({
      membershipId,
      origin,
      viewer: session.user,
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: session.user.organizationId,
      action: "user.password_reset.create",
      entityType: "membership",
      entityId: membershipId,
      metadata: {
        targetEmail: reset.user.email,
        expiresAt: reset.expiresAt,
      },
    });

    return NextResponse.json(reset);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create reset link.",
      },
      { status: 400 },
    );
  }
}
