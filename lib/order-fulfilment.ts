export const orderFulfilmentTypes = [
  "DINE_IN",
  "PICKUP",
  "DELIVERY",
] as const;

export type OrderFulfilmentType = (typeof orderFulfilmentTypes)[number];

export const orderFulfilmentLabels: Record<OrderFulfilmentType, string> = {
  DINE_IN: "Dine-in",
  PICKUP: "Takeaway",
  DELIVERY: "Delivery",
};

export const orderFulfilmentDescriptions: Record<
  OrderFulfilmentType,
  string
> = {
  DINE_IN: "Eat at the restaurant",
  PICKUP: "Take away from the restaurant",
  DELIVERY: "Delivered by the restaurant",
};

export function getOrderFulfilmentLabel(type: OrderFulfilmentType) {
  return orderFulfilmentLabels[type];
}

export function supportsScheduledFulfilment(type: OrderFulfilmentType) {
  return type !== "DINE_IN";
}
