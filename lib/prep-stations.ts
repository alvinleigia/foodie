import "server-only";

import { and, asc, count, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { menuItems, prepStations } from "@/db/schema";
import { slugify } from "@/lib/slugs";
import { getDefaultTenantContext, type TenantContext } from "@/lib/tenant-context";
import {
  prepStationSchema,
  type PrepStationInput,
} from "@/lib/validations/prep-station";

export class PrepStationConflictError extends Error {}

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
      name: "Drinks",
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

export async function getPrepStationConfiguration(
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();
  const [stations, assignmentRows] = await Promise.all([
    getPrepStations(context, true),
    db
      .select({
        prepStationId: menuItems.prepStationId,
        assignedItemCount: count(),
      })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.organizationId, context.organizationId),
          isNotNull(menuItems.prepStationId),
        ),
      )
      .groupBy(menuItems.prepStationId),
  ]);
  const assignmentCounts = new Map(
    assignmentRows.map((row) => [
      row.prepStationId,
      Number(row.assignedItemCount),
    ]),
  );

  return stations.map((station) => ({
    ...station,
    assignedItemCount: assignmentCounts.get(station.id) ?? 0,
  }));
}

export async function savePrepStation(
  input: PrepStationInput,
  options: {
    context?: TenantContext;
    prepStationId?: string;
  } = {},
) {
  const parsed = prepStationSchema.parse(input);
  const context = options.context ?? getDefaultTenantContext();
  const db = getDb();
  let savedPrepStationId: string | null = null;

  await db.transaction(async (tx) => {
    const now = new Date();

    if (options.prepStationId) {
      const [existing] = await tx
        .select()
        .from(prepStations)
        .where(
          and(
            eq(prepStations.id, options.prepStationId),
            eq(prepStations.organizationId, context.organizationId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new PrepStationConflictError("Preparation station not found.");
      }
      savedPrepStationId = existing.id;

      if (existing.isActive && !parsed.isActive) {
        const [assignedItem] = await tx
          .select({ id: menuItems.id })
          .from(menuItems)
          .where(
            and(
              eq(menuItems.organizationId, context.organizationId),
              eq(menuItems.prepStationId, existing.id),
            ),
          )
          .limit(1);

        if (assignedItem) {
          throw new PrepStationConflictError(
            "Reassign this station's menu items before deactivating it.",
          );
        }
      }

      await tx
        .update(prepStations)
        .set({
          name: parsed.name,
          type: parsed.type,
          sortOrder: parsed.sortOrder,
          isActive: parsed.isActive,
          updatedAt: now,
        })
        .where(
          and(
            eq(prepStations.id, existing.id),
            eq(prepStations.organizationId, context.organizationId),
          ),
        );

      return;
    }

    const existingSlugs = new Set(
      (
        await tx
          .select({ slug: prepStations.slug })
          .from(prepStations)
          .where(eq(prepStations.organizationId, context.organizationId))
      ).map((station) => station.slug),
    );
    const baseSlug = slugify(parsed.name) || "station";
    let slug = baseSlug;
    let suffix = 2;

    while (existingSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const [created] = await tx
      .insert(prepStations)
      .values({
        organizationId: context.organizationId,
        slug,
        name: parsed.name,
        type: parsed.type,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
        updatedAt: now,
      })
      .returning({ id: prepStations.id });
    savedPrepStationId = created?.id ?? null;
  });

  return {
    savedPrepStationId,
    stations: await getPrepStationConfiguration(context),
  };
}
