import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  menuItemTaxAssignments,
  organizations,
  organizationDefaultTaxes,
  organizationTaxDefinitions,
  organizationTaxProfiles,
  organizationTaxRates,
} from "@/db/schema";
import {
  restaurantTaxDefinitionSchema,
  type RestaurantTaxDefinitionInput,
} from "@/lib/validations/restaurant-tax-definition";
import type { RestaurantTaxDefinitionRecord } from "@/types/tax";

type RestaurantIdentity = {
  id: string;
  timezone: string;
};

function getDateForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
}

function getPreviousDate(date: string) {
  const previous = new Date(`${date}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

async function getRestaurantIdentity(
  restaurantOrganizationId: string,
  companyOrganizationId?: string,
): Promise<RestaurantIdentity | null> {
  const conditions = [
    eq(organizations.id, restaurantOrganizationId),
    eq(organizations.type, "RESTAURANT" as const),
  ];

  if (companyOrganizationId) {
    conditions.push(
      eq(organizations.parentOrganizationId, companyOrganizationId),
    );
  }

  const [restaurant] = await getDb()
    .select({ id: organizations.id, timezone: organizations.timezone })
    .from(organizations)
    .where(and(...conditions))
    .limit(1);

  return restaurant ?? null;
}

export async function getRestaurantTaxDefinitions(
  restaurantOrganizationId: string,
  companyOrganizationId?: string,
) {
  const restaurant = await getRestaurantIdentity(
    restaurantOrganizationId,
    companyOrganizationId,
  );

  if (!restaurant) {
    return null;
  }

  const businessDate = getDateForTimezone(restaurant.timezone);
  const db = getDb();
  const [definitionRows, rateRows, defaultRows, assignmentRows] =
    await Promise.all([
      db
        .select()
        .from(organizationTaxDefinitions)
        .where(
          eq(
            organizationTaxDefinitions.organizationId,
            restaurantOrganizationId,
          ),
        )
        .orderBy(
          asc(organizationTaxDefinitions.calculationOrder),
          asc(organizationTaxDefinitions.name),
        ),
      db
        .select()
        .from(organizationTaxRates)
        .where(
          and(
            eq(
              organizationTaxRates.organizationId,
              restaurantOrganizationId,
            ),
            lte(organizationTaxRates.effectiveFrom, businessDate),
            or(
              isNull(organizationTaxRates.effectiveTo),
              gte(organizationTaxRates.effectiveTo, businessDate),
            ),
          ),
        )
        .orderBy(desc(organizationTaxRates.effectiveFrom)),
      db
        .select({ taxDefinitionId: organizationDefaultTaxes.taxDefinitionId })
        .from(organizationDefaultTaxes)
        .where(
          eq(
            organizationDefaultTaxes.organizationId,
            restaurantOrganizationId,
          ),
        ),
      db
        .select({ taxDefinitionId: menuItemTaxAssignments.taxDefinitionId })
        .from(menuItemTaxAssignments)
        .where(
          eq(
            menuItemTaxAssignments.organizationId,
            restaurantOrganizationId,
          ),
        ),
    ]);
  const currentRateByDefinitionId = new Map<
    string,
    (typeof rateRows)[number]
  >();

  for (const rate of rateRows) {
    if (!currentRateByDefinitionId.has(rate.taxDefinitionId)) {
      currentRateByDefinitionId.set(rate.taxDefinitionId, rate);
    }
  }

  const defaultIds = new Set(defaultRows.map((row) => row.taxDefinitionId));
  const assignmentCounts = new Map<string, number>();

  for (const assignment of assignmentRows) {
    assignmentCounts.set(
      assignment.taxDefinitionId,
      (assignmentCounts.get(assignment.taxDefinitionId) ?? 0) + 1,
    );
  }

  const definitions: RestaurantTaxDefinitionRecord[] = definitionRows.map(
    (definition) => {
      const rate = currentRateByDefinitionId.get(definition.id);

      return {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        treatment: definition.treatment,
        isCompound: definition.isCompound,
        calculationOrder: definition.calculationOrder,
        isActive: definition.isActive,
        isDefault: defaultIds.has(definition.id),
        rateBps: rate?.rateBps ?? null,
        rateEffectiveFrom: rate?.effectiveFrom ?? null,
        assignedItemCount: assignmentCounts.get(definition.id) ?? 0,
        isProfileDefault: definition.code === "DEFAULT",
      };
    },
  );

  return { businessDate, definitions };
}

export async function saveRestaurantTaxDefinition(
  restaurantOrganizationId: string,
  input: RestaurantTaxDefinitionInput,
  options: {
    companyOrganizationId?: string;
    taxDefinitionId?: string;
  } = {},
) {
  const parsed = restaurantTaxDefinitionSchema.parse(input);
  const restaurant = await getRestaurantIdentity(
    restaurantOrganizationId,
    options.companyOrganizationId,
  );

  if (!restaurant) {
    return null;
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ taxSystem: organizationTaxProfiles.taxSystem })
      .from(organizationTaxProfiles)
      .where(
        eq(
          organizationTaxProfiles.organizationId,
          restaurantOrganizationId,
        ),
      )
      .limit(1);

    if (!profile || profile.taxSystem === "NONE") {
      throw new Error("Enable the restaurant tax profile before adding taxes.");
    }

    let definitionId = options.taxDefinitionId;
    let existingDefinition:
      | typeof organizationTaxDefinitions.$inferSelect
      | undefined;

    if (definitionId) {
      [existingDefinition] = await tx
        .select()
        .from(organizationTaxDefinitions)
        .where(
          and(
            eq(organizationTaxDefinitions.id, definitionId),
            eq(
              organizationTaxDefinitions.organizationId,
              restaurantOrganizationId,
            ),
          ),
        )
        .limit(1);

      if (!existingDefinition) {
        throw new Error("Tax definition not found.");
      }

      if (existingDefinition.code === "DEFAULT") {
        throw new Error("Edit the profile default in the Tax profile section.");
      }
    }

    if (!parsed.isActive && definitionId) {
      const [assignment] = await tx
        .select({ id: menuItemTaxAssignments.id })
        .from(menuItemTaxAssignments)
        .where(eq(menuItemTaxAssignments.taxDefinitionId, definitionId))
        .limit(1);

      if (assignment) {
        throw new Error(
          "Remove this tax from menu items before deactivating it.",
        );
      }
    }

    const now = new Date();
    const values = {
      organizationId: restaurantOrganizationId,
      code: parsed.code,
      name: parsed.name,
      treatment: parsed.treatment,
      isCompound: parsed.isCompound,
      calculationOrder: parsed.calculationOrder,
      isActive: parsed.isActive,
      updatedAt: now,
    };

    if (definitionId) {
      const [updated] = await tx
        .update(organizationTaxDefinitions)
        .set(values)
        .where(
          and(
            eq(organizationTaxDefinitions.id, definitionId),
            eq(
              organizationTaxDefinitions.organizationId,
              restaurantOrganizationId,
            ),
          ),
        )
        .returning({ id: organizationTaxDefinitions.id });
      definitionId = updated?.id;
    } else {
      const [created] = await tx
        .insert(organizationTaxDefinitions)
        .values(values)
        .returning({ id: organizationTaxDefinitions.id });
      definitionId = created?.id;
    }

    if (!definitionId) {
      throw new Error("The tax definition could not be saved.");
    }

    const rateBps = Math.round(parsed.ratePercent * 100);
    const [nextRate] = await tx
      .select({ effectiveFrom: organizationTaxRates.effectiveFrom })
      .from(organizationTaxRates)
      .where(
        and(
          eq(organizationTaxRates.taxDefinitionId, definitionId),
          gt(organizationTaxRates.effectiveFrom, parsed.effectiveFrom),
        ),
      )
      .orderBy(asc(organizationTaxRates.effectiveFrom))
      .limit(1);
    await tx
      .update(organizationTaxRates)
      .set({
        effectiveTo: getPreviousDate(parsed.effectiveFrom),
        updatedAt: now,
      })
      .where(
        and(
          eq(organizationTaxRates.taxDefinitionId, definitionId),
          lt(organizationTaxRates.effectiveFrom, parsed.effectiveFrom),
          or(
            isNull(organizationTaxRates.effectiveTo),
            gte(
              organizationTaxRates.effectiveTo,
              parsed.effectiveFrom,
            ),
          ),
        ),
      );
    await tx
      .insert(organizationTaxRates)
      .values({
        organizationId: restaurantOrganizationId,
        taxDefinitionId: definitionId,
        rateBps,
        effectiveFrom: parsed.effectiveFrom,
        effectiveTo: nextRate
          ? getPreviousDate(nextRate.effectiveFrom)
          : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          organizationTaxRates.taxDefinitionId,
          organizationTaxRates.effectiveFrom,
        ],
        set: {
          rateBps,
          effectiveTo: nextRate
            ? getPreviousDate(nextRate.effectiveFrom)
            : null,
          updatedAt: now,
        },
      });

    if (parsed.isDefault && parsed.isActive) {
      await tx
        .insert(organizationDefaultTaxes)
        .values({
          organizationId: restaurantOrganizationId,
          taxDefinitionId: definitionId,
          sortOrder: parsed.calculationOrder,
        })
        .onConflictDoUpdate({
          target: [
            organizationDefaultTaxes.organizationId,
            organizationDefaultTaxes.taxDefinitionId,
          ],
          set: { sortOrder: parsed.calculationOrder },
        });
    } else {
      await tx
        .delete(organizationDefaultTaxes)
        .where(
          and(
            eq(
              organizationDefaultTaxes.organizationId,
              restaurantOrganizationId,
            ),
            eq(organizationDefaultTaxes.taxDefinitionId, definitionId),
          ),
        );
    }
  });

  return getRestaurantTaxDefinitions(
    restaurantOrganizationId,
    options.companyOrganizationId,
  );
}
