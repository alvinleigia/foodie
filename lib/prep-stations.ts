import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { prepStations } from "@/db/schema";
import { getDefaultTenantContext, type TenantContext } from "@/lib/tenant-context";

export function getDefaultPrepStationValues(organizationId: string) {
  return [
    {
      organizationId,
      slug: "kitchen",
      name: "Kitchen",
      type: "KITCHEN" as const,
      sortOrder: 0,
      isActive: true,
      updatedAt: new Date(),
    },
    {
      organizationId,
      slug: "bar",
      name: "Bar",
      type: "BAR" as const,
      sortOrder: 1,
      isActive: true,
      updatedAt: new Date(),
    },
  ];
}

export async function getPrepStations(
  context: TenantContext = getDefaultTenantContext(),
  includeInactive = false,
) {
  return getDb()
    .select()
    .from(prepStations)
    .where(
      and(
        eq(prepStations.organizationId, context.organizationId),
        ...(includeInactive ? [] : [eq(prepStations.isActive, true)]),
      ),
    )
    .orderBy(asc(prepStations.sortOrder), asc(prepStations.name));
}

export async function getActivePrepStation(
  prepStationId: string | null | undefined,
  context: TenantContext = getDefaultTenantContext(),
) {
  if (!prepStationId) {
    return null;
  }

  const [station] = await getDb()
    .select()
    .from(prepStations)
    .where(
      and(
        eq(prepStations.id, prepStationId),
        eq(prepStations.organizationId, context.organizationId),
        eq(prepStations.isActive, true),
      ),
    )
    .limit(1);

  return station ?? null;
}
