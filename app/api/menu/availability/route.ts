import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireMenuManagerSession } from "@/lib/auth";
import {
  getMenuAvailabilityConfiguration,
  MenuAvailabilityConflictError,
  MenuAvailabilityNotFoundError,
  saveMenuAvailabilitySchedule,
} from "@/lib/menu-availability";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireMenuManagerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const context = await getCurrentTenantContext();
    return NextResponse.json(await getMenuAvailabilityConfiguration(context));
  } catch (error) {
    if (error instanceof MenuAvailabilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load menu availability.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMenuManagerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const context = await getCurrentTenantContext();
    const body = await request.json();
    const configuration = await saveMenuAvailabilitySchedule(context, body);
    const submittedName =
      body && typeof body === "object" && "name" in body
        ? String(body.name).trim().toLowerCase()
        : "";
    const schedule =
      configuration.schedules.find(
        (item) => item.name.trim().toLowerCase() === submittedName,
      ) ?? null;
    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "menu.availability_schedule.create",
      entityType: "menu_availability_schedule",
      entityId: schedule?.id ?? null,
      metadata: {
        name: schedule?.name ?? null,
        categoryCount: schedule?.categoryIds.length ?? 0,
        itemCount: schedule?.itemIds.length ?? 0,
      },
    });
    return NextResponse.json(configuration, { status: 201 });
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
            : "Failed to create menu availability schedule.",
      },
      { status: 500 },
    );
  }
}
