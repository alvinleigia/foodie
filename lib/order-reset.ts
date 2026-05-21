import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appState } from "@/db/schema";

const GLOBAL_APP_STATE_KEY = "global";

export async function getOrdersResetAt() {
  const db = getDb();
  const [state] = await db
    .select({ ordersResetAt: appState.ordersResetAt })
    .from(appState)
    .where(eq(appState.key, GLOBAL_APP_STATE_KEY))
    .limit(1);

  return state?.ordersResetAt?.toISOString() ?? null;
}

export async function markOrdersReset() {
  const db = getDb();
  const now = new Date();

  await db
    .insert(appState)
    .values({
      key: GLOBAL_APP_STATE_KEY,
      ordersResetAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appState.key,
      set: {
        ordersResetAt: now,
        updatedAt: now,
      },
    });

  return now.toISOString();
}
