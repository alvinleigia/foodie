import { and, eq } from "drizzle-orm";
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
        ),
      );

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status !== "PREPARING") {
      return NextResponse.json(
        { error: "Only preparing orders can be marked as ready." },
        { status: 409 },
      );
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const now = new Date();

      await tx
        .update(orderItems)
        .set({
          status: "READY",
          readyAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.status, "PREPARING"),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );

      const [nextOrder] = await tx
        .update(orders)
        .set({
          status: "READY",
          readyAt: order.readyAt ?? now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        )
        .returning();

      return nextOrder;
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.ready",
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
