export const CUSTOMER_ORDERS_STORAGE_KEY = "bar_customer_orders";
export const CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY = "bar_customer_orders_reset_marker";
export const CUSTOMER_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

export const orderStatuses = [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export type LocalCustomerOrder = {
  orderId: string;
  orderNo: number;
  customerToken: string;
  customerName: string;
  categoryName: string;
  drinkName: string;
  status: OrderStatus;
  createdAt: string;
};
