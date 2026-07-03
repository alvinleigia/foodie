import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { serializeOrder } from "@/lib/orders";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, id),
          eq(orders.organizationId, tenantContext.organizationId),
          eq(orders.locationId, tenantContext.locationId),
        ),
      );

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status !== "READY") {
      return NextResponse.json(
        { error: "Only ready orders can be marked as delivered." },
        { status: 409 },
      );
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const now = new Date();
      const items = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
            eq(orderItems.locationId, tenantContext.locationId),
          ),
        );
      const deliverableItems = items.filter((item) => item.status === "READY");

      if (deliverableItems.length > 0) {
        await tx
          .update(orderItems)
          .set({
            status: "DELIVERED",
            deliveredAt: now,
            updatedAt: now,
          })
          .where(
            and(
              inArray(
                orderItems.id,
                deliverableItems.map((item) => item.id),
              ),
              eq(orderItems.organizationId, tenantContext.organizationId),
              eq(orderItems.locationId, tenantContext.locationId),
            ),
          );

      }

      const [nextOrder] = await tx
        .update(orders)
        .set({
          status: "DELIVERED",
          deliveredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
            eq(orders.locationId, tenantContext.locationId),
          ),
        )
        .returning();

      return nextOrder;
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: tenantContext.locationId,
      action: "order.deliver",
      entityType: "order",
      entityId: updatedOrder.id,
      metadata: {
        orderNo: updatedOrder.orderNo,
        previousStatus: order.status,
        nextStatus: updatedOrder.status,
      },
    });

    return NextResponse.json(serializeOrder(updatedOrder));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update order." },
      { status: 500 },
    );
  }
}
