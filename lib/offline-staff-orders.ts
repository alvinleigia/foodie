export type OfflineStaffOrder = {
  clientRequestId: string;
  createdAt: string;
  endpoint: string;
  lastError: string | null;
  payload: Record<string, unknown>;
};

const storageKey = "foodie:offline-staff-orders:v1";
const maximumQueuedOrders = 50;

export function readOfflineStaffOrders(): OfflineStaffOrder[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineStaffOrders(orders: OfflineStaffOrder[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(orders));
}

export function queueOfflineStaffOrder(
  order: Omit<OfflineStaffOrder, "createdAt" | "lastError">,
) {
  const current = readOfflineStaffOrders().filter(
    (item) => item.clientRequestId !== order.clientRequestId,
  );
  const next = [
    ...current,
    { ...order, createdAt: new Date().toISOString(), lastError: null },
  ].slice(-maximumQueuedOrders);
  writeOfflineStaffOrders(next);
  return next.length;
}

export async function syncOfflineStaffOrders() {
  const queued = readOfflineStaffOrders();
  const remaining: OfflineStaffOrder[] = [];
  let synced = 0;

  for (let index = 0; index < queued.length; index += 1) {
    const order = queued[index];

    try {
      const response = await fetch(order.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order.payload),
      });

      if (response.ok) {
        synced += 1;
        continue;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      remaining.push({
        ...order,
        lastError:
          typeof payload?.error === "string"
            ? payload.error
            : `Sync failed with status ${response.status}.`,
      });
    } catch {
      remaining.push(order, ...queued.slice(index + 1));
      break;
    }
  }

  writeOfflineStaffOrders(remaining);
  return { pending: remaining.length, synced };
}
