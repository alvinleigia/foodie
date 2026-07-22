import type { OrderItemStatus, OrderStatus } from "@/lib/constants";

export const orderCorrectionTargets: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [],
  PREPARING: ["PENDING"],
  ASSEMBLING: ["PREPARING"],
  READY: ["ASSEMBLING"],
  DELIVERED: ["READY"],
  CANCELLED: ["PENDING"],
};

export const orderItemCorrectionTargets: Record<OrderItemStatus, OrderItemStatus[]> = {
  PENDING: [],
  PREPARING: ["PENDING"],
  READY: ["PREPARING"],
  DELIVERED: ["READY"],
  CANCELLED: ["PENDING"],
};

export const statusCorrectionLabels: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  ASSEMBLING: "Assembling",
  READY: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function canCorrectOrderStatus(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
) {
  return orderCorrectionTargets[currentStatus].includes(nextStatus);
}

export function canCorrectOrderItemStatus(
  currentStatus: OrderItemStatus,
  nextStatus: OrderItemStatus,
) {
  return orderItemCorrectionTargets[currentStatus].includes(nextStatus);
}
