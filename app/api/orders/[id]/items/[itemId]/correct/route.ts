import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth";
import { orderItemStatuses, type OrderItemStatus, type OrderStatus } from "@/lib/constants";
import {
  InventoryReservationError,
  reserveInventoryForOrderItem,
} from "@/lib/inventory";
import { canCorrectOrderItemStatus } from "@/lib/order-corrections";
import {
  OrderTransitionConflictError,
  requireOrderTransitionResult,
} from "@/lib/order-transition";
import { deriveOrderStatusFromItems } from "@/lib/order-status";
import { writeAuditLog } from "@/lib/audit-log";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
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
  return deriveOrderStatusFromItems(items.map((item) => item.status));
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

  if (nextStatus === "ASSEMBLING") {
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
    const session = await requireStaffPermission("orders.correct_status");

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
    const inventoryEnabled = (
      await getOrganizationFeatureEntitlement(
        tenantContext.organizationId,
        "operations.inventory",
      )
    ).enabled;
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

    if (order.cancellationFeeBpsApplied !== null) {
      return NextResponse.json(
        {
          error:
            "Items in a financially settled cancellation cannot be reopened.",
        },
        { status: 409 },
      );
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

    if (
      item.status === "CANCELLED" &&
      nextStatus === "PENDING" &&
      order.paymentStatus !== "NOT_REQUIRED" &&
      order.paymentStatus !== "UNPAID"
    ) {
      return NextResponse.json(
        {
          error:
            "A cancelled item cannot be reopened after payment collection has started.",
        },
        { status: 409 },
      );
    }

    const result = await db.transaction(async (tx) => {
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

      if (
        !lockedOrder ||
        lockedOrder.status !== order.status ||
        lockedOrder.cancellationFeeBpsApplied !==
          order.cancellationFeeBpsApplied
      ) {
        throw new OrderTransitionConflictError();
      }

      const [lockedItem] = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.id, itemId),
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!lockedItem || lockedItem.status !== item.status) {
        throw new OrderTransitionConflictError();
      }

      if (
        lockedItem.status === "CANCELLED" &&
        nextStatus === "PENDING" &&
        lockedOrder.paymentStatus !== "NOT_REQUIRED" &&
        lockedOrder.paymentStatus !== "UNPAID"
      ) {
        throw new OrderTransitionConflictError(
          "A cancelled item cannot be reopened after payment collection has started.",
        );
      }

      const itemPatch = getItemTimestampPatch(nextStatus, now);

      if (
        inventoryEnabled &&
        lockedItem.status === "CANCELLED" &&
        nextStatus === "PENDING"
      ) {
        const wasReserved = await reserveInventoryForOrderItem(
          tx,
          tenantContext,
          lockedItem,
        );

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
            eq(orderItems.status, lockedItem.status),
          ),
        )
        .returning();
      const nextItem = requireOrderTransitionResult(updatedItem);

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
        .set(getOrderTimestampPatch(nextOrderStatus, lockedOrder, now))
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
            eq(orders.status, lockedOrder.status),
          ),
        )
        .returning();

      return {
        previousItem: lockedItem,
        updatedItem: nextItem,
        updatedOrder: requireOrderTransitionResult(updatedOrder),
      };
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.item.status.correct",
      entityType: "order_item",
      entityId: result.updatedItem.id,
      metadata: {
        approvedByUserId: session.user.id,
        approvedByUsername: session.user.username,
        approvalMode: "MANAGER_SESSION",
        orderId: result.updatedOrder.id,
        orderNo: result.updatedOrder.orderNo,
        drinkName: result.updatedItem.drinkName,
        quantity: result.updatedItem.quantity,
        previousStatus: result.previousItem.status,
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
    if (
      error instanceof InventoryReservationError ||
      error instanceof OrderTransitionConflictError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to correct order item." },
      { status: 500 },
    );
  }
}
