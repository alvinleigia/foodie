import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { getCurrentTenantContext } from "@/lib/tenant-context";

type ItemAction = "start" | "ready" | "announce" | "deliver" | "cancel";

function isItemAction(value: unknown): value is ItemAction {
  return (
    value === "start" ||
    value === "ready" ||
    value === "announce" ||
    value === "deliver" ||
    value === "cancel"
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!isItemAction(body.action)) {
      return NextResponse.json(
        { error: "Invalid item action." },
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

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Items in a closed order cannot be updated." },
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

    if (body.action === "start" && item.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending items can be started." },
        { status: 409 },
      );
    }

    if (body.action === "ready" && item.status !== "PREPARING") {
      return NextResponse.json(
        { error: "Only preparing items can be marked ready." },
        { status: 409 },
      );
    }

    if (
      (body.action === "announce" || body.action === "deliver") &&
      item.status !== "READY"
    ) {
      return NextResponse.json(
        { error: "Only ready items can use this action." },
        { status: 409 },
      );
    }

    if (
      body.action === "cancel" &&
      (item.status === "DELIVERED" || item.status === "CANCELLED")
    ) {
      return NextResponse.json(
        { error: "This item is already closed." },
        { status: 409 },
      );
    }

    if (body.action === "announce") {
      await db
        .update(orders)
        .set({
          announcementCount: sql`${orders.announcementCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        );

      await writeAuditLog({
        actor: session.user,
        organizationId: tenantContext.organizationId,
        locationId: null,
        action: "order.item.announce",
        entityType: "order_item",
        entityId: item.id,
        metadata: {
          orderId: order.id,
          orderNo: order.orderNo,
          drinkName: item.drinkName,
          quantity: item.quantity,
          previousStatus: item.status,
          nextStatus: item.status,
        },
      });

      return NextResponse.json({
        orderId: order.id,
        orderStatus: order.status,
        itemId: item.id,
        itemStatus: item.status,
      });
    }

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const itemUpdate =
        body.action === "start"
          ? {
              status: "PREPARING" as const,
              startedAt: now,
              updatedAt: now,
            }
          : body.action === "ready"
            ? {
                status: "READY" as const,
                readyAt: now,
                updatedAt: now,
              }
            : body.action === "deliver"
              ? {
                  status: "DELIVERED" as const,
                  deliveredAt: now,
                  updatedAt: now,
                }
              : {
                  status: "CANCELLED" as const,
                  cancelledAt: now,
                  inventoryReservedAt: null,
                  updatedAt: now,
                };

      if (body.action === "cancel" && item.inventoryReservedAt) {
        await restoreReservedInventoryForOrderItem(tx, tenantContext, item);
      }

      const [updatedItem] = await tx
        .update(orderItems)
        .set(itemUpdate)
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
      const openItems = currentItems.filter(
        (currentItem) =>
          currentItem.status !== "DELIVERED" && currentItem.status !== "CANCELLED",
      );
      const allItemsCancelled = currentItems.every(
        (currentItem) => currentItem.status === "CANCELLED",
      );
      const allItemsClosed = currentItems.every(
        (currentItem) =>
          currentItem.status === "DELIVERED" || currentItem.status === "CANCELLED",
      );
      const allOpenItemsReady =
        openItems.length > 0 &&
        openItems.every((currentItem) => currentItem.status === "READY");
      const hasStartedItem = currentItems.some(
        (currentItem) => currentItem.status !== "PENDING",
      );
      const nextOrderStatus = allItemsCancelled
        ? "CANCELLED"
        : allItemsClosed
          ? "DELIVERED"
          : allOpenItemsReady
            ? "READY"
            : hasStartedItem
              ? "PREPARING"
              : "PENDING";

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: nextOrderStatus,
          startedAt:
            nextOrderStatus === "PENDING" ? order.startedAt : (order.startedAt ?? now),
          readyAt: nextOrderStatus === "READY" ? (order.readyAt ?? now) : null,
          deliveredAt: nextOrderStatus === "DELIVERED" ? now : null,
          cancelledAt: nextOrderStatus === "CANCELLED" ? now : null,
          cancelledByType:
            nextOrderStatus === "CANCELLED" ? "STAFF" : order.cancelledByType,
          updatedAt: now,
        })
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
      action: `order.item.${body.action}`,
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
      },
    });

    return NextResponse.json({
      orderId: result.updatedOrder.id,
      orderStatus: result.updatedOrder.status,
      itemId: result.updatedItem.id,
      itemStatus: result.updatedItem.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update order item." },
      { status: 500 },
    );
  }
}
