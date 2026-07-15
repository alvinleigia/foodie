import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { PlanLimitError } from "@/lib/billing";
import { restaurantAdminRoles } from "@/lib/role-access";
import { reassignExistingUserForRestaurant } from "@/lib/saas-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: Request) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const result = await reassignExistingUserForRestaurant(
      context,
      await request.json(),
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: result.membership.organizationId,
      action: "restaurant.staff.reassign",
      entityType: "membership",
      entityId: result.membership.id,
      metadata: {
        userId: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.membership.role,
        deactivatedMembershipCount: result.deactivatedMembershipCount,
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
