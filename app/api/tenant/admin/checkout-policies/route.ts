import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getRestaurantCheckoutPolicies,
  updateRestaurantCheckoutPolicies,
} from "@/lib/restaurant-checkout-policies";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  return NextResponse.json({
    policies: await getRestaurantCheckoutPolicies(context.organizationId),
  });
}

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const policies = await updateRestaurantCheckoutPolicies(
      context.organizationId,
      await request.json(),
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.checkout_policies.update",
      entityType: "restaurant_checkout_policy",
      entityId: context.organizationId,
      metadata: { policies },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update checkout policies.",
      },
      { status: 500 },
    );
  }
}
