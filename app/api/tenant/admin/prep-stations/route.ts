import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getPrepStationConfiguration,
  savePrepStation,
} from "@/lib/prep-stations";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("menu.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  const stations = await getPrepStationConfiguration(context);

  return NextResponse.json({ stations });
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("menu.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const body = await request.json();
    const result = await savePrepStation(body, { context });
    const created = result.stations.find(
      (station) => station.id === result.savedPrepStationId,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.prep_station.create",
      entityType: "prep_station",
      entityId: created?.id ?? null,
      metadata: {
        name: created?.name ?? String(body.name ?? "").trim(),
        type: created?.type ?? body.type ?? null,
      },
    });

    return NextResponse.json({ stations: result.stations }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create preparation station.",
      },
      { status: 500 },
    );
  }
}
