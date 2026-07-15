import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { orderItemStatuses, type OrderItemStatus, type OrderStatus } from "@/lib/constants";
import {
  InventoryReservationError,
  reserveInventoryForOrderItem,
} from "@/lib/inventory";
import { canCorrectOrderItemStatus } from "@/lib/order-corrections";
import { restaurantAdminRoles } from "@/lib/role-access";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function isOrderItemStatus(value: unknown): value is OrderItemStatus {
  return typeof value === "string" && orderItemStatuses.includes(value as OrderItemStatus);
}

function getItemTimestampPatch(nextStatus: OrderItemStatus, now: Date) {
  if (nextStatus === "PENDING") {
    return {
      status: nextStatus,
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
  }

  if (nextStatus === "PREPARING") {
    return {
      status: nextStatus,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
  }

  return {
    status: nextStatus,
    deliveredAt: null,
    cancelledAt: null,
    updatedAt: now,
  };
}

function getNextOrderStatus(items: Array<typeof orderItems.$inferSelect>): OrderStatus {
  const openItems = items.filter(
    (item) => item.status !== "DELIVERED" && item.status !== "CANCELLED",
  );
  const allItemsCancelled = items.every((item) => item.status === "CANCELLED");
  const allItemsClosed = items.every(
    (item) => item.status === "DELIVERED" || item.status === "CANCELLED",
  );
  const allOpenItemsReady =
    openItems.length > 0 && openItems.every((item) => item.status === "READY");
  const hasStartedItem = items.some((item) => item.status !== "PENDING");

  if (allItemsCancelled) {
    return "CANCELLED";
  }

  if (allItemsClosed) {
    return "DELIVERED";
  }

  if (allOpenItemsReady) {
    return "READY";
  }

  if (hasStartedItem) {
    return "PREPARING";
  }

  return "PENDING";
}

function getOrderTimestampPatch(
  nextStatus: OrderStatus,
  order: typeof orders.$inferSelect,
  now: Date,
) {
  if (nextStatus === "PENDING") {
    return {
      status: nextStatus,
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      cancelledByType: null,
      cancelledByUserId: null,
      cancelReason: null,
      updatedAt: now,
    };
  }

  if (nextStatus === "PREPARING") {
    return {
      status: nextStatus,
      startedAt: order.startedAt ?? now,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      cancelledByType: null,
      cancelledByUserId: null,
      cancelReason: null,
      updatedAt: now,
    };
  }

  if (nextStatus === "READY") {
    return {
      status: nextStatus,
      startedAt: order.startedAt ?? now,
      readyAt: order.readyAt ?? now,
      deliveredAt: null,
      cancelledAt: null,
      cancelledByType: null,
      cancelledByUserId: null,
      cancelReason: null,
      updatedAt: now,
    };
  }

  return {
    status: nextStatus,
    deliveredAt: nextStatus === "DELIVERED" ? (order.deliveredAt ?? now) : null,
    cancelledAt: nextStatus === "CANCELLED" ? (order.cancelledAt ?? now) : null,
    cancelledByType: nextStatus === "CANCELLED" ? order.cancelledByType : null,
    cancelledByUserId: nextStatus === "CANCELLED" ? order.cancelledByUserId : null,
    cancelReason: nextStatus === "CANCELLED" ? order.cancelReason : null,
    updatedAt: now,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await requireRole(restaurantAdminRoles);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const nextStatus = body.status;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!isOrderItemStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid correction status." }, { status: 400 });
    }

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Please add a correction reason." },
        { status: 400 },
      );
    }

    const { id, itemId } = await context.params;
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

    const [item] = await db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemId),
          eq(orderItems.orderId, id),
          eq(orderItems.organizationId, tenantContext.organizationId),
        ),
      );

    if (!item) {
      return NextResponse.json({ error: "Order item not found." }, { status: 404 });
    }

    if (!canCorrectOrderItemStatus(item.status, nextStatus)) {
      return NextResponse.json(
        { error: "This item status cannot be corrected to the selected state." },
        { status: 409 },
      );
    }

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const itemPatch = getItemTimestampPatch(nextStatus, now);

      if (item.status === "CANCELLED" && nextStatus === "PENDING") {
        const wasReserved = await reserveInventoryForOrderItem(tx, tenantContext, item);

        if (wasReserved) {
          Object.assign(itemPatch, { inventoryReservedAt: now });
        }
      }

      const [updatedItem] = await tx
        .update(orderItems)
        .set(itemPatch)
        .where(
          and(
            eq(orderItems.id, itemId),
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        )
        .returning();

      const currentItems = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );
      const nextOrderStatus = getNextOrderStatus(currentItems);

      const [updatedOrder] = await tx
        .update(orders)
        .set(getOrderTimestampPatch(nextOrderStatus, order, now))
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        )
        .returning();

      return { updatedItem, updatedOrder };
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "order.item.status.correct",
      entityType: "order_item",
      entityId: result.updatedItem.id,
      metadata: {
        orderId: result.updatedOrder.id,
        orderNo: result.updatedOrder.orderNo,
        drinkName: result.updatedItem.drinkName,
        quantity: result.updatedItem.quantity,
        previousStatus: item.status,
        nextStatus: result.updatedItem.status,
        orderStatus: result.updatedOrder.status,
        reason,
      },
    });

    return NextResponse.json({
      orderId: result.updatedOrder.id,
      orderStatus: result.updatedOrder.status,
      itemId: result.updatedItem.id,
      itemStatus: result.updatedItem.status,
    });
  } catch (error) {
    if (error instanceof InventoryReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to correct order item." },
      { status: 500 },
    );
  }
}
