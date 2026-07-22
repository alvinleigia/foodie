import "server-only";

import type { OrderLineItem } from "@/lib/constants";
import type {
  KdsBoardPayload,
  KdsStation,
  KdsTicket,
} from "@/lib/kds-types";
import {
  getOrderItemsForOrders,
  getStaffOrders,
} from "@/lib/orders";
import { getPrepStations } from "@/lib/prep-stations";
import {
  getDefaultTenantContext,
  type TenantContext,
} from "@/lib/tenant-context";

const openItemStatuses = new Set(["PENDING", "PREPARING", "READY"]);

function isRoutedOpenItem(item: OrderLineItem) {
  return Boolean(
    item.id &&
      item.prepStationId &&
      item.prepStationNameSnapshot &&
      openItemStatuses.has(item.status),
  );
}

export async function getKdsBoard(
  canUpdateStatus: boolean,
  context: TenantContext = getDefaultTenantContext(),
): Promise<KdsBoardPayload> {
  const [{ activeOrders }, configuredStations] = await Promise.all([
    getStaffOrders(context, { view: "active" }),
    getPrepStations(context),
  ]);
  const itemMap = await getOrderItemsForOrders(
    activeOrders.map((order) => order.id),
    context,
  );
  const stationsById = new Map<string, KdsStation>(
    configuredStations.map((station) => [
      station.id,
      { id: station.id, name: station.name, type: station.type },
    ]),
  );
  const tickets: KdsTicket[] = [];

  for (const order of activeOrders) {
    const orderItems = itemMap.get(order.id) ?? [];
    const routedItems = orderItems.filter(isRoutedOpenItem);
    const displayItems =
      order.status === "ASSEMBLING"
        ? orderItems.filter(
            (item) =>
              item.id && item.status !== "DELIVERED" && item.status !== "CANCELLED",
          )
        : routedItems;

    for (const item of routedItems) {
      if (!stationsById.has(item.prepStationId!)) {
        stationsById.set(item.prepStationId!, {
          id: item.prepStationId!,
          name: item.prepStationNameSnapshot!,
          type: "OTHER",
        });
      }
    }

    if (displayItems.length === 0) {
      continue;
    }

    tickets.push({
      createdAt: order.createdAt.toISOString(),
      customerName: order.customerName,
      fulfilmentType: order.fulfilmentType,
      items: displayItems.map((item) => ({
        id: item.id!,
        drinkName: item.drinkName,
        modifiers: (item.modifiers ?? []).map((modifier) => ({
          id: modifier.id,
          modifierName: modifier.modifierName,
          quantity: modifier.quantity,
        })),
        notes: item.notes,
        prepStationId: item.prepStationId ?? "unrouted",
        prepStationName: item.prepStationNameSnapshot ?? "Unrouted",
        quantity: item.quantity,
        status: item.status,
      })),
      orderDate: order.orderDate,
      orderId: order.id,
      orderNo: order.orderNo,
      promisedFulfilmentAt: order.promisedFulfilmentAt?.toISOString() ?? null,
      requestedFulfilmentAt: order.requestedFulfilmentAt?.toISOString() ?? null,
      status: order.status,
    });
  }

  tickets.sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return {
    canUpdateStatus,
    orders: tickets,
    stations: [...stationsById.values()],
  };
}
