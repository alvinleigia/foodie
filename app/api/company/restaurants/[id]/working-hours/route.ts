import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { updateRestaurantWorkingHours } from "@/lib/restaurant-working-hours";
import { companyAdminRoles } from "@/lib/role-access";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const workingHours = await updateRestaurantWorkingHours(
      id,
      await request.json(),
      session.user.organizationId,
    );

    if (!workingHours) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "company.restaurant_working_hours.update",
      entityType: "restaurant_ordering_periods",
      entityId: id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
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
