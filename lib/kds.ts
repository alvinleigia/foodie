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
    getStaffOrders(context),
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
    const routedItems = (itemMap.get(order.id) ?? []).filter(isRoutedOpenItem);

    for (const item of routedItems) {
      if (!stationsById.has(item.prepStationId!)) {
        stationsById.set(item.prepStationId!, {
          id: item.prepStationId!,
          name: item.prepStationNameSnapshot!,
          type: "OTHER",
        });
      }
    }

    if (routedItems.length === 0) {
      continue;
    }

    tickets.push({
      createdAt: order.createdAt.toISOString(),
      customerName: order.customerName,
      fulfilmentType: order.fulfilmentType,
      items: routedItems.map((item) => ({
        id: item.id!,
        drinkName: item.drinkName,
        modifiers: (item.modifiers ?? []).map((modifier) => ({
          id: modifier.id,
          modifierName: modifier.modifierName,
          quantity: modifier.quantity,
        })),
        notes: item.notes,
        prepStationId: item.prepStationId!,
        prepStationName: item.prepStationNameSnapshot!,
        quantity: item.quantity,
        status: item.status,
      })),
      orderDate: order.orderDate,
      orderId: order.id,
      orderNo: order.orderNo,
      promisedFulfilmentAt: order.promisedFulfilmentAt?.toISOString() ?? null,
      requestedFulfilmentAt: order.requestedFulfilmentAt?.toISOString() ?? null,
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
