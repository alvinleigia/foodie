import type { OrderItemStatus, OrderStatus } from "@/lib/constants";

export function deriveOrderStatusFromItems(
  itemStatuses: OrderItemStatus[],
  currentOrderStatus?: OrderStatus,
): OrderStatus {
  if (itemStatuses.length === 0) {
    return "PENDING";
  }

  const openItems = itemStatuses.filter(
    (status) => status !== "DELIVERED" && status !== "CANCELLED",
  );
  const allItemsCancelled = itemStatuses.every(
    (status) => status === "CANCELLED",
  );
  const allItemsClosed = itemStatuses.every(
    (status) => status === "DELIVERED" || status === "CANCELLED",
  );
  const allOpenItemsReady =
    openItems.length > 0 && openItems.every((status) => status === "READY");
  const hasStartedItem = itemStatuses.some((status) => status !== "PENDING");

  if (allItemsCancelled) {
    return "CANCELLED";
  }

  if (allItemsClosed) {
    return "DELIVERED";
  }

  if (allOpenItemsReady) {
    return currentOrderStatus === "READY" ? "READY" : "ASSEMBLING";
  }

  if (hasStartedItem) {
    return "PREPARING";
  }

  return "PENDING";
}
