import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { orderItemModifiers, orderItems, orderPayments, orders } from "@/db/schema";
import {
  OrderLineItem,
  OrderLineItemModifier,
  OrderPaymentMethod,
  OrderStatus,
} from "@/lib/constants";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import { getDefaultTenantContext, TenantContext } from "@/lib/tenant-context";

const activeOrderStatuses: OrderStatus[] = ["PENDING", "PREPARING", "READY"];
const pastOrderStatuses: OrderStatus[] = ["DELIVERED", "CANCELLED"];

function activeOrderRank() {
  return sql<number>`case ${orders.status}
    when 'PENDING' then 1
    when 'PREPARING' then 2
    when 'READY' then 3
    else 4
  end`;
}

function pastOrderClosedAt() {
  return sql<Date>`coalesce(${orders.deliveredAt}, ${orders.cancelledAt}, ${orders.createdAt})`;
}

export function isActiveOrderStatus(status: OrderStatus) {
  return activeOrderStatuses.includes(status);
}

export function isPastOrderStatus(status: OrderStatus) {
  return pastOrderStatuses.includes(status);
}

function groupItemsByOrder(
  items: typeof orderItems.$inferSelect[],
  modifiersByItemId = new Map<string, OrderLineItemModifier[]>(),
) {
  const map = new Map<string, OrderLineItem[]>();

  for (const item of items) {
    const list = map.get(item.orderId) ?? [];
    list.push({
      id: item.id,
      organizationId: item.organizationId,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      drinkId: item.drinkId,
      drinkName: item.drinkName,
      quantity: item.quantity,
      notes: item.notes ?? null,
      unitPrice: item.unitPrice ?? null,
      status: item.status,
      startedAt: item.startedAt?.toISOString() ?? null,
      readyAt: item.readyAt?.toISOString() ?? null,
      deliveredAt: item.deliveredAt?.toISOString() ?? null,
      cancelledAt: item.cancelledAt?.toISOString() ?? null,
      modifiers: modifiersByItemId.get(item.id) ?? [],
    });
    map.set(item.orderId, list);
  }

  return map;
}

async function getModifiersByOrderItemId(
  itemIds: string[],
  context: TenantContext = getDefaultTenantContext(),
) {
  if (itemIds.length === 0) {
    return new Map<string, OrderLineItemModifier[]>();
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(orderItemModifiers)
    .where(
      and(
        inArray(orderItemModifiers.orderItemId, itemIds),
        eq(orderItemModifiers.organizationId, context.organizationId),
      ),
    );
  const modifiersByItemId = new Map<string, OrderLineItemModifier[]>();

  for (const row of rows) {
    const modifiers = modifiersByItemId.get(row.orderItemId) ?? [];
    modifiers.push({
      id: row.id,
      modifierGroupId: row.modifierGroupId,
      modifierGroupName: row.modifierGroupName,
      modifierId: row.modifierId,
      modifierName: row.modifierName,
      quantity: row.quantity,
      priceDelta: row.priceDelta,
    });
    modifiersByItemId.set(row.orderItemId, modifiers);
  }

  return modifiersByItemId;
}

export function buildOrderSummary(items: Array<{ drinkName: string; quantity: number }>) {
  if (items.length === 0) {
    return "Order";
  }

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const first = items[0];

  if (items.length === 1 && first.quantity === 1) {
    return first.drinkName;
  }

  if (items.length === 1) {
    return `${first.drinkName} x${first.quantity}`;
  }

  return `${first.drinkName} + ${totalQuantity - first.quantity} more`;
}

function getDisplayedPaymentAmount(
  order: typeof orders.$inferSelect,
  items: OrderLineItem[],
) {
  if (
    order.source !== "STAFF_CREATED" ||
    order.paymentStatus !== "UNPAID" ||
    order.status === "CANCELLED" ||
    !order.paymentCurrency
  ) {
    return order.paymentAmount;
  }

  const currency = order.paymentCurrency;
  let totalMinor = 0;

  for (const item of items.filter((current) => current.status !== "CANCELLED")) {
    if (item.unitPrice === null) {
      return null;
    }

    const modifierMinor = (item.modifiers ?? []).reduce(
      (total, modifier) =>
        total +
        decimalToMinorUnits(modifier.priceDelta, currency) *
          modifier.quantity,
      0,
    );
    totalMinor +=
      (decimalToMinorUnits(item.unitPrice, currency) + modifierMinor) *
      item.quantity;
  }

  return totalMinor > 0
    ? minorUnitsToDecimal(totalMinor, currency)
    : null;
}

export function serializeOrder(
  order: typeof orders.$inferSelect,
  items: OrderLineItem[] = [],
  paymentMethod: OrderPaymentMethod | null = null,
) {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    organizationId: order.organizationId,
    customerName: order.customerName,
    source: order.source,
    categoryName: order.categoryName,
    drinkName: order.drinkName,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    status: order.status,
    customerToken: order.customerToken,
    createdAt: order.createdAt.toISOString(),
    startedAt: order.startedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    announcementCount: order.announcementCount,
    paymentStatus: order.paymentStatus,
    paymentMethod:
      paymentMethod ??
      (order.stripeCheckoutSessionId ? "STRIPE_CHECKOUT" : null),
    paymentAmount: getDisplayedPaymentAmount(order, items),
    paymentCurrency: order.paymentCurrency,
    customerCancellationFeeBps:
      order.customerCancellationFeeBpsSnapshot,
    cancellationFeeBpsApplied: order.cancellationFeeBpsApplied,
    cancellationFeeAmount: order.cancellationFeeAmount,
    refundAmount: order.refundAmount,
  };
}

export async function getActiveOrders(context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  return db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, context.organizationId),
        inArray(orders.status, activeOrderStatuses),
      ),
    )
    .orderBy(activeOrderRank(), desc(orders.createdAt));
}

export async function getStaffOrders(context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const [activeOrders, pastOrders] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, context.organizationId),
          inArray(orders.status, activeOrderStatuses),
          or(
            inArray(orders.paymentStatus, ["NOT_REQUIRED", "UNPAID", "PAID"]),
            and(
              eq(orders.source, "STAFF_CREATED"),
              eq(orders.paymentStatus, "PENDING"),
            ),
          ),
        ),
      )
      .orderBy(activeOrderRank(), desc(orders.createdAt)),
    db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, context.organizationId),
          inArray(orders.status, pastOrderStatuses),
          or(
            inArray(orders.paymentStatus, [
              "NOT_REQUIRED",
              "UNPAID",
              "PAID",
              "REFUND_PENDING",
              "PARTIALLY_REFUNDED",
              "REFUND_FAILED",
              "REFUNDED",
            ]),
            and(
              eq(orders.source, "STAFF_CREATED"),
              eq(orders.paymentStatus, "PENDING"),
            ),
          ),
        ),
      )
      .orderBy(desc(pastOrderClosedAt())),
  ]);

  return { activeOrders, pastOrders };
}

export async function getLatestOrderPaymentsForOrders(
  orderIds: string[],
  context: TenantContext = getDefaultTenantContext(),
) {
  if (orderIds.length === 0) {
    return new Map<string, OrderPaymentMethod>();
  }

  const rows = await getDb()
    .select({
      method: orderPayments.method,
      orderId: orderPayments.orderId,
    })
    .from(orderPayments)
    .where(
      and(
        inArray(orderPayments.orderId, orderIds),
        eq(orderPayments.organizationId, context.organizationId),
      ),
    )
    .orderBy(desc(orderPayments.createdAt));
  const methods = new Map<string, OrderPaymentMethod>();

  for (const row of rows) {
    if (!methods.has(row.orderId)) {
      methods.set(row.orderId, row.method);
    }
  }

  return methods;
}


export async function getCustomerAccountOrders(
  organizationCustomerId: string,
  view: "ALL" | "COMPLETED",
  context: TenantContext = getDefaultTenantContext(),
) {
  const filters = [
    eq(orders.organizationId, context.organizationId),
    eq(orders.organizationCustomerId, organizationCustomerId),
  ];

  if (view === "COMPLETED") {
    filters.push(inArray(orders.status, pastOrderStatuses));
  }

  return getDb()
    .select()
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(100);
}

export async function getCustomerAccountOrdersByIds(
  organizationCustomerId: string,
  orderIds: string[],
  context: TenantContext = getDefaultTenantContext(),
) {
  if (orderIds.length === 0) {
    return [];
  }

  return getDb()
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.id, orderIds),
        eq(orders.organizationId, context.organizationId),
        eq(orders.organizationCustomerId, organizationCustomerId),
      ),
    )
    .orderBy(desc(orders.createdAt));
}

export async function getOrderItemsForOrders(
  orderIds: string[],
  context: TenantContext = getDefaultTenantContext(),
) {
  if (orderIds.length === 0) {
    return new Map<string, OrderLineItem[]>();
  }

  const db = getDb();
  const items = await db
    .select()
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderIds),
        eq(orderItems.organizationId, context.organizationId),
      ),
    );

  const modifiersByItemId = await getModifiersByOrderItemId(
    items.map((item) => item.id),
    context,
  );

  return groupItemsByOrder(items, modifiersByItemId);
}

export async function getOrderItems(
  orderId: string,
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();
  const items = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.organizationId, context.organizationId),
      ),
    );

  const modifiersByItemId = await getModifiersByOrderItemId(
    items.map((item) => item.id),
    context,
  );

  return groupItemsByOrder(items, modifiersByItemId).get(orderId) ?? [];
}
