import { ZodError } from "zod";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  companyAdminRoles,
  platformAdminRoles,
  restaurantAdminRoles,
} from "@/lib/role-access";
import { updateUserAccountForEditor } from "@/lib/user-account";

export async function PATCH(
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
    const result = await updateUserAccountForEditor({
      membershipId,
      editor: session.user,
      input: await request.json(),
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: result.target.organizationId,
      locationId: result.target.locationId,
      action: "user.account.update",
      entityType: "user",
      entityId: result.user.id,
      metadata: {
        membershipId,
        previous: result.previous,
        next: {
          username: result.user.username,
          name: result.user.name,
          email: result.user.email,
        },
      },
    });

    return NextResponse.json({ user: result.user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update account.",
      },
      { status: 400 },
    );
  }
}
