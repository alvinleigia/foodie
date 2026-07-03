import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { and, eq } from "drizzle-orm";

import { orderItems, orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { markOrdersReset } from "@/lib/order-reset";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { confirmationText?: string };
    const confirmationText = body.confirmationText?.trim().toLowerCase();

    if (confirmationText !== "delete") {
      return NextResponse.json(
        { error: 'Type "delete" exactly to clear all order records.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const tenantContext = await getCurrentTenantContext();
    const deletedOrders = await db.transaction(async (tx) => {
      const reservedItems = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.organizationId, tenantContext.organizationId),
            eq(orderItems.locationId, tenantContext.locationId),
          ),
        );

      for (const item of reservedItems.filter(
        (reservedItem) =>
          reservedItem.inventoryReservedAt && reservedItem.status !== "DELIVERED",
      )) {
        await restoreReservedInventoryForOrderItem(tx, tenantContext, item);
      }

      return tx
        .delete(orders)
        .where(
          and(
            eq(orders.organizationId, tenantContext.organizationId),
            eq(orders.locationId, tenantContext.locationId),
          ),
        )
        .returning({ id: orders.id });
    });
    const ordersResetAt = await markOrdersReset();

    return NextResponse.json({
      success: true,
      deletedCount: deletedOrders.length,
      ordersResetAt,
      message: deletedOrders.length
        ? `Cleared ${deletedOrders.length} order records.`
        : "There were no order records to clear.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear orders." },
      { status: 500 },
    );
  }
}
