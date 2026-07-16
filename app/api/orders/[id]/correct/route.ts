import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { orderStatuses, type OrderStatus } from "@/lib/constants";
import {
  InventoryReservationError,
  reserveInventoryForOrderItem,
} from "@/lib/inventory";
import { canCorrectOrderStatus } from "@/lib/order-corrections";
import { serializeOrder } from "@/lib/orders";
import { restaurantAdminRoles } from "@/lib/role-access";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentTenantContext } from "@/lib/tenant-context";

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && orderStatuses.includes(value as OrderStatus);
}

function getOrderTimestampPatch(nextStatus: OrderStatus, now: Date) {
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
      readyAt: null,
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
    deliveredAt: null,
    cancelledAt: null,
    cancelledByType: null,
    cancelledByUserId: null,
    cancelReason: null,
    updatedAt: now,
  };
}

function getItemTimestampPatch(nextStatus: OrderStatus, now: Date) {
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole(restaurantAdminRoles);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const nextStatus = body.status;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!isOrderStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid correction status." }, { status: 400 });
    }

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Please add a correction reason." },
        { status: 400 },
      );
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

    if (!canCorrectOrderStatus(order.status, nextStatus)) {
      return NextResponse.json(
        { error: "This order status cannot be corrected to the selected state." },
        { status: 409 },
      );
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const now = new Date();
      const currentItems = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );

      const reservedItemIds: string[] = [];

      if (order.status === "CANCELLED" && nextStatus === "PENDING") {
        for (const item of currentItems) {
          const wasReserved = await reserveInventoryForOrderItem(tx, tenantContext, item);

          if (wasReserved) {
            reservedItemIds.push(item.id);
          }
        }
      }

      await tx
        .update(orderItems)
        .set(getItemTimestampPatch(nextStatus, now))
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );

      const [nextOrder] = await tx
        .update(orders)
        .set(getOrderTimestampPatch(nextStatus, now))
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        )
        .returning();

      if (reservedItemIds.length > 0) {
        await tx
          .update(orderItems)
          .set({
            inventoryReservedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              inArray(orderItems.id, reservedItemIds),
              eq(orderItems.organizationId, tenantContext.organizationId),
            ),
          );
      }

      return nextOrder;
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.status.correct",
      entityType: "order",
      entityId: updatedOrder.id,
      metadata: {
        orderNo: updatedOrder.orderNo,
        previousStatus: order.status,
        nextStatus: updatedOrder.status,
        reason,
      },
    });

    return NextResponse.json(serializeOrder(updatedOrder));
  } catch (error) {
    if (error instanceof InventoryReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to correct order status." },
      { status: 500 },
    );
  }
}
