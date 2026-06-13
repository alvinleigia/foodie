import { desc, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { OrderStatus } from "@/lib/constants";

export function isActiveOrderStatus(status: OrderStatus) {
  return status === "PENDING" || status === "PREPARING" || status === "READY";
}

export function isPastOrderStatus(status: OrderStatus) {
  return status === "DELIVERED" || status === "CANCELLED";
}

export function serializeOrder(order: typeof orders.$inferSelect) {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    categoryName: order.categoryName,
    drinkName: order.drinkName,
    status: order.status,
    customerToken: order.customerToken,
    createdAt: order.createdAt.toISOString(),
    startedAt: order.startedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    announcementCount: order.announcementCount,
  };
}

export async function getActiveOrders() {
  const db = getDb();
  const activeOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

  const statusRank: Record<OrderStatus, number> = {
    PENDING: 1,
    PREPARING: 2,
    READY: 3,
    DELIVERED: 4,
    CANCELLED: 5,
  };

  return activeOrders
    .filter((order) => isActiveOrderStatus(order.status))
    .sort((left, right) => {
      const rankDifference = statusRank[left.status] - statusRank[right.status];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });
}

export async function getMixologistOrders() {
  const db = getDb();
  const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

  const statusRank: Record<OrderStatus, number> = {
    PENDING: 1,
    PREPARING: 2,
    READY: 3,
    DELIVERED: 4,
    CANCELLED: 5,
  };

  const activeOrders = allOrders
    .filter((order) => isActiveOrderStatus(order.status))
    .sort((left, right) => {
      const rankDifference = statusRank[left.status] - statusRank[right.status];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });

  const pastOrders = allOrders
    .filter((order) => isPastOrderStatus(order.status))
    .sort((left, right) => {
      const leftClosedAt =
        left.deliveredAt?.getTime() ?? left.cancelledAt?.getTime() ?? left.createdAt.getTime();
      const rightClosedAt =
        right.deliveredAt?.getTime() ?? right.cancelledAt?.getTime() ?? right.createdAt.getTime();

      return rightClosedAt - leftClosedAt;
    });

  return { activeOrders, pastOrders };
}

export async function getCustomerOrders(input: Array<{ orderId: string; customerToken: string }>) {
  if (input.length === 0) {
    return [];
  }

  const db = getDb();

  const foundOrders = await db
    .select()
    .from(orders)
    .where(inArray(orders.id, input.map((item) => item.orderId)));

  const allowedMap = new Map(input.map((item) => [item.orderId, item.customerToken]));

  return foundOrders.filter((order) => allowedMap.get(order.id) === order.customerToken);
}
