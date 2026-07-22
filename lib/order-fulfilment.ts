export const orderFulfilmentTypes = [
  "DINE_IN",
  "TAKEAWAY",
  "COLLECTION",
  "DELIVERY",
] as const;

export type OrderFulfilmentType = (typeof orderFulfilmentTypes)[number];

export const orderFulfilmentLabels: Record<OrderFulfilmentType, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  COLLECTION: "Collection",
  DELIVERY: "Delivery",
};

export const orderFulfilmentDescriptions: Record<
  OrderFulfilmentType,
  string
> = {
  DINE_IN: "Eat at the restaurant",
  TAKEAWAY: "Order here and take away",
  COLLECTION: "Collect from the restaurant",
  DELIVERY: "Delivered by the restaurant",
};

export function getOrderFulfilmentLabel(type: OrderFulfilmentType) {
  return orderFulfilmentLabels[type];
}
