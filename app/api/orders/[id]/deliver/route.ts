import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OrderTransitionConflictError,
  requireOrderTransitionResult,
} from "@/lib/order-transition";
import { serializeOrder } from "@/lib/orders";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffPermission("orders.update_status");

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

    const transition = await db.transaction(async (tx) => {
      const now = new Date();
      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!lockedOrder || lockedOrder.status !== order.status) {
        throw new OrderTransitionConflictError();
      }

      const [updatedOrder] = await tx
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
            eq(orders.status, lockedOrder.status),
          ),
        )
        .returning();
      const nextOrder = requireOrderTransitionResult(updatedOrder);

      await tx
        .update(orderItems)
        .set({
          status: "DELIVERED",
          deliveredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
            eq(orderItems.status, "READY"),
          ),
        );

      return { previousOrder: lockedOrder, updatedOrder: nextOrder };
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.deliver",
      entityType: "order",
      entityId: transition.updatedOrder.id,
      metadata: {
        orderNo: transition.updatedOrder.orderNo,
        previousStatus: transition.previousOrder.status,
        nextStatus: transition.updatedOrder.status,
      },
    });

    return NextResponse.json(serializeOrder(transition.updatedOrder));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update order." },
      { status: error instanceof OrderTransitionConflictError ? 409 : 500 },
    );
  }
}
