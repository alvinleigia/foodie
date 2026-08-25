import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizations,
  restaurantOrderingPeriods,
} from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context";
import { restaurantWorkingHoursInputSchema } from "@/lib/validations/working-hours";
import type { RestaurantWorkingHours } from "@/lib/working-hours";

export async function getRestaurantWorkingHours(
  organizationId: string,
): Promise<RestaurantWorkingHours | null> {
  const db = getDb();
  const rows = await db
    .select({
      closesAtMinute: restaurantOrderingPeriods.closesAtMinute,
      dayOfWeek: restaurantOrderingPeriods.dayOfWeek,
      enabled: organizations.customerOrderingHoursEnabled,
      is24Hours: restaurantOrderingPeriods.is24Hours,
      opensAtMinute: restaurantOrderingPeriods.opensAtMinute,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .leftJoin(
      restaurantOrderingPeriods,
      eq(restaurantOrderingPeriods.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .orderBy(
      asc(restaurantOrderingPeriods.dayOfWeek),
      asc(restaurantOrderingPeriods.sortOrder),
    );
  const organization = rows[0];

  if (!organization) {
    return null;
  }

  return {
    enabled: organization.enabled,
    periods: rows.flatMap((row) =>
      row.dayOfWeek === null ||
      row.opensAtMinute === null ||
      row.closesAtMinute === null ||
      row.is24Hours === null
        ? []
        : [
            {
              closesAtMinute: row.closesAtMinute,
              dayOfWeek: row.dayOfWeek,
              is24Hours: row.is24Hours,
              opensAtMinute: row.opensAtMinute,
            },
          ],
    ),
    timezone: organization.timezone,
  };
}

export async function updateRestaurantWorkingHours(
  organizationId: string,
  input: unknown,
  companyOrganizationId?: string,
) {
  const parsed = restaurantWorkingHoursInputSchema.parse(input);
  const db = getDb();
  const organizationFilter = and(
    eq(organizations.id, organizationId),
    eq(organizations.type, "RESTAURANT"),
    companyOrganizationId
      ? eq(organizations.parentOrganizationId, companyOrganizationId)
      : undefined,
  );

  const updated = await db.transaction(async (tx) => {
    const [organization] = await tx
      .update(organizations)
      .set({
        customerOrderingHoursEnabled: parsed.enabled,
        updatedAt: new Date(),
      })
      .where(organizationFilter)
      .returning({ id: organizations.id });

    if (!organization) {
      return null;
    }

    await tx
      .delete(restaurantOrderingPeriods)
      .where(eq(restaurantOrderingPeriods.organizationId, organizationId));

    const sortOrderByDay = new Map<number, number>();

    if (parsed.periods.length > 0) {
      await tx.insert(restaurantOrderingPeriods).values(
        parsed.periods.map((period) => {
          const sortOrder = sortOrderByDay.get(period.dayOfWeek) ?? 0;
          sortOrderByDay.set(period.dayOfWeek, sortOrder + 1);

          return {
            ...period,
            organizationId,
            sortOrder,
          };
        }),
      );
    }

    return organization;
  });

  return updated ? getRestaurantWorkingHours(organizationId) : null;
}

export async function getTenantRestaurantWorkingHours(context: TenantContext) {
  return getRestaurantWorkingHours(context.organizationId);
}
