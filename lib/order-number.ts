import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, orders } from "@/db/schema";
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";
import { TenantContext } from "@/lib/tenant-context";

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type OrderNumberClient = DbClient | TransactionClient;

function formatDateForTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export async function getLocationBusinessDate(
  db: OrderNumberClient,
  context: TenantContext,
) {
  const [location] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(
      and(
        eq(locations.id, context.locationId),
        eq(locations.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return formatDateForTimeZone(new Date(), location?.timezone ?? DEFAULT_TIMEZONE);
}

export async function getNextOrderNumber(
  db: OrderNumberClient,
  context: TenantContext,
  orderDate: string,
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${context.organizationId}), hashtext(${`${context.locationId}:${orderDate}`}))`,
  );

  const [row] = await db
    .select({
      nextOrderNo: sql<number>`coalesce(max(${orders.orderNo}), 0) + 1`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, context.organizationId),
        eq(orders.locationId, context.locationId),
        eq(orders.orderDate, orderDate),
      ),
    );

  return row?.nextOrderNo ?? 1;
}
