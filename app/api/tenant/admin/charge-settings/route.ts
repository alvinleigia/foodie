import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getRestaurantChargeSettings,
  updateRestaurantChargeSettings,
} from "@/lib/restaurant-charge-settings";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await getCurrentTenantContext();
  return NextResponse.json({
    settings: await getRestaurantChargeSettings(context.organizationId),
  });
}

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const context = await getCurrentTenantContext();
    const settings = await updateRestaurantChargeSettings(
      context.organizationId,
      await request.json(),
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.charge_settings.update",
      entityType: "restaurant_charge_settings",
      entityId: context.organizationId,
      metadata: settings,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Charge settings could not be saved." },
      { status: 500 },
    );
  }
}
