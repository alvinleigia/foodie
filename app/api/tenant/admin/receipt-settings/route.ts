import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getRestaurantReceiptSettings,
  updateRestaurantReceiptSettings,
} from "@/lib/restaurant-receipt-settings";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  return NextResponse.json({
    settings: await getRestaurantReceiptSettings(context.organizationId),
  });
}

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const settings = await updateRestaurantReceiptSettings(
      context.organizationId,
      await request.json(),
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.receipt_settings.update",
      entityType: "restaurant_receipt_settings",
      entityId: context.organizationId,
      metadata: settings,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Receipt settings could not be saved.",
      },
      { status: 500 },
    );
  }
}
