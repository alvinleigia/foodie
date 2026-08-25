import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { updateRestaurantWorkingHours } from "@/lib/restaurant-working-hours";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const workingHours = await updateRestaurantWorkingHours(
      context.organizationId,
      await request.json(),
    );

    if (!workingHours) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.working_hours.update",
      entityType: "restaurant_ordering_periods",
      entityId: context.organizationId,
      metadata: {
        enabled: workingHours.enabled,
        periodCount: workingHours.periods.length,
        timezone: workingHours.timezone,
      },
    });

    return NextResponse.json({ workingHours });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update working hours.",
      },
      { status: 500 },
    );
  }
}
