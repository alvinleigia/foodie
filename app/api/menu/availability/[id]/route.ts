import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireMenuManagerSession } from "@/lib/auth";
import {
  MenuAvailabilityConflictError,
  MenuAvailabilityNotFoundError,
  saveMenuAvailabilitySchedule,
} from "@/lib/menu-availability";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PUT(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireMenuManagerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const context = await getCurrentTenantContext();
    const { id } = await routeContext.params;
    const configuration = await saveMenuAvailabilitySchedule(
      context,
      await request.json(),
      id,
    );
    const schedule = configuration.schedules.find((item) => item.id === id);
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "menu.availability_schedule.update",
      entityType: "menu_availability_schedule",
      entityId: id,
      metadata: {
        name: schedule?.name ?? null,
        isEnabled: schedule?.isEnabled ?? null,
        categoryCount: schedule?.categoryIds.length ?? 0,
        itemCount: schedule?.itemIds.length ?? 0,
      },
    });
    return NextResponse.json(configuration);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof MenuAvailabilityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MenuAvailabilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update menu availability schedule.",
      },
      { status: 500 },
    );
  }
}
