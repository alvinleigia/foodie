import {
  CUSTOMER_HISTORY_RETENTION_MS,
  CUSTOMER_ORDERS_STORAGE_KEY,
  CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY,
  LocalCustomerOrder,
} from "@/lib/constants";

function getOrderAgeMs(order: LocalCustomerOrder) {
  const createdTime = new Date(order.createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - createdTime;
}

export function shouldKeepCustomerOrder(order: LocalCustomerOrder) {
  if (order.status === "PENDING" || order.status === "PREPARING" || order.status === "READY") {
    return true;
  }

  return getOrderAgeMs(order) < CUSTOMER_HISTORY_RETENTION_MS;
}

export function pruneCustomerOrders(orders: LocalCustomerOrder[]) {
  return orders.filter(shouldKeepCustomerOrder);
}

export function readStoredCustomerOrders() {
  const parsed = JSON.parse(
    window.localStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) ?? "[]",
  ) as LocalCustomerOrder[];

  const pruned = pruneCustomerOrders(parsed);

  if (pruned.length !== parsed.length) {
    window.localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(pruned));
  }

  return pruned;
}

export function writeStoredCustomerOrders(orders: LocalCustomerOrder[]) {
  window.localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(pruneCustomerOrders(orders)));
}

export function clearStoredCustomerOrders() {
  window.localStorage.removeItem(CUSTOMER_ORDERS_STORAGE_KEY);
}

export function readStoredCustomerOrdersResetMarker() {
  return window.localStorage.getItem(CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY);
}

export function writeStoredCustomerOrdersResetMarker(resetMarker: string | null) {
  if (!resetMarker) {
    window.localStorage.removeItem(CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY, resetMarker);
}

export function syncCustomerOrdersResetMarker(serverResetMarker: string | null) {
  if (!serverResetMarker) {
    return false;
  }

  const localResetMarker = readStoredCustomerOrdersResetMarker();

  if (localResetMarker === serverResetMarker) {
    return false;
  }

  clearStoredCustomerOrders();
  writeStoredCustomerOrdersResetMarker(serverResetMarker);
  return true;
}
