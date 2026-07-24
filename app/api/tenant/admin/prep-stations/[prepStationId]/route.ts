import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  PrepStationConflictError,
  savePrepStation,
} from "@/lib/prep-stations";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ prepStationId: string }> },
) {
  const session = await requireStaffPermission("menu.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const { prepStationId } = await context.params;
    const body = await request.json();
    const result = await savePrepStation(body, {
      context: tenantContext,
      prepStationId,
    });
    const updated = result.stations.find(
      (station) => station.id === prepStationId,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.prep_station.update",
      entityType: "prep_station",
      entityId: prepStationId,
      metadata: {
        isActive: updated?.isActive ?? body.isActive ?? null,
        name: updated?.name ?? String(body.name ?? "").trim(),
        type: updated?.type ?? body.type ?? null,
      },
    });

    return NextResponse.json({ stations: result.stations });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof PrepStationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update preparation station.",
      },
      { status: 500 },
    );
  }
}
