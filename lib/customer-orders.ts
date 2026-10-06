import {
  CUSTOMER_HISTORY_RETENTION_MS,
  CUSTOMER_ORDERS_STORAGE_KEY,
  CUSTOMER_ORDERS_RESET_MARKER_STORAGE_KEY,
  LocalCustomerOrder,
} from "@/lib/constants";

const CUSTOMER_ORDERS_CHANGED_EVENT = "foodie:customer-orders-changed";
const EMPTY_CUSTOMER_ORDERS_SNAPSHOT = "[]";

function getOrderAgeMs(order: LocalCustomerOrder) {
  const createdTime = new Date(order.createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - createdTime;
}

export function shouldKeepCustomerOrder(order: LocalCustomerOrder) {
  if (
    order.status === "PENDING" ||
    order.status === "PREPARING" ||
    order.status === "ASSEMBLING" ||
    order.status === "READY"
  ) {
    return true;
  }

  return getOrderAgeMs(order) < CUSTOMER_HISTORY_RETENTION_MS;
}

export function pruneCustomerOrders(orders: LocalCustomerOrder[]) {
  return orders.filter(shouldKeepCustomerOrder);
}

export function parseStoredCustomerOrdersSnapshot(snapshot: string) {
  try {
    return pruneCustomerOrders(JSON.parse(snapshot) as LocalCustomerOrder[]);
  } catch {
    return [];
  }
}

export function getStoredCustomerOrdersSnapshot() {
  return (
    window.localStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) ??
    EMPTY_CUSTOMER_ORDERS_SNAPSHOT
  );
}

export function getServerCustomerOrdersSnapshot() {
  return EMPTY_CUSTOMER_ORDERS_SNAPSHOT;
}

export function subscribeToStoredCustomerOrders(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (!event.key || event.key === CUSTOMER_ORDERS_STORAGE_KEY) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CUSTOMER_ORDERS_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CUSTOMER_ORDERS_CHANGED_EVENT, onStoreChange);
  };
}

function notifyStoredCustomerOrdersChanged() {
  window.dispatchEvent(new Event(CUSTOMER_ORDERS_CHANGED_EVENT));
}

export function readStoredCustomerOrders() {
  const snapshot = getStoredCustomerOrdersSnapshot();
  const parsed = parseStoredCustomerOrdersSnapshot(snapshot);

  if (JSON.stringify(parsed) !== snapshot) {
    window.localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(parsed));
  }

  return parsed;
}

export function writeStoredCustomerOrders(orders: LocalCustomerOrder[]) {
  window.localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(pruneCustomerOrders(orders)));
  notifyStoredCustomerOrdersChanged();
}

export function clearStoredCustomerOrders() {
  window.localStorage.removeItem(CUSTOMER_ORDERS_STORAGE_KEY);
  notifyStoredCustomerOrdersChanged();
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
