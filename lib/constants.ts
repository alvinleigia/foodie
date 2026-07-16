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

export const orderItemStatuses = [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderItemStatus = (typeof orderItemStatuses)[number];

export type OrderLineItem = {
  id?: string;
  organizationId?: string;
  categoryId: string;
  categoryName: string;
  drinkId: string;
  drinkName: string;
  quantity: number;
  notes: string | null;
  unitPrice: string | null;
  status: OrderItemStatus;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  modifiers?: OrderLineItemModifier[];
};

export type OrderLineItemModifier = {
  id?: string;
  modifierGroupId: string;
  modifierGroupName: string;
  modifierId: string;
  modifierName: string;
  quantity: number;
  priceDelta: string;
};

export type LocalCustomerOrder = {
  orderId: string;
  orderNo: number;
  orderDate?: string;
  organizationId?: string;
  customerToken: string;
  customerName: string;
  categoryName: string;
  drinkName: string;
  itemCount?: number;
  items?: OrderLineItem[];
  status: OrderStatus;
  createdAt: string;
};
