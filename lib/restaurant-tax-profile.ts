import { and, eq, gte, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizations,
  organizationDefaultTaxes,
  organizationTaxDefinitions,
  organizationTaxProfiles,
  organizationTaxRates,
} from "@/db/schema";
import { restaurantTaxProfileSchema } from "@/lib/validations/restaurant-tax-profile";

export type RestaurantTaxPricing = {
  pricingMode: "INCLUSIVE" | "EXCLUSIVE";
  taxRateBps: number;
};

export const defaultRestaurantTaxPricing: RestaurantTaxPricing = {
  pricingMode: "INCLUSIVE",
  taxRateBps: 0,
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

export async function getRestaurantTaxProfile(
  restaurantOrganizationId: string,
) {
  const [profile] = await getDb()
    .select({ profile: organizationTaxProfiles })
    .from(organizationTaxProfiles)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationTaxProfiles.organizationId),
    )
    .where(
      and(
        eq(organizationTaxProfiles.organizationId, restaurantOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  return profile?.profile ?? null;
}

export async function getRestaurantTaxPricing(
  restaurantOrganizationId: string,
): Promise<RestaurantTaxPricing> {
  const profile = await getRestaurantTaxProfile(restaurantOrganizationId);

  if (!profile || profile.taxSystem === "NONE") {
    return defaultRestaurantTaxPricing;
  }

  return {
    pricingMode: profile.pricingMode,
    taxRateBps: profile.defaultTaxRateBps,
  };
}

export async function updateRestaurantTaxProfile(
  restaurantOrganizationId: string,
  input: unknown,
  companyOrganizationId?: string,
) {
  const parsed = restaurantTaxProfileSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const organizationConditions = [
      eq(organizations.id, restaurantOrganizationId),
      eq(organizations.type, "RESTAURANT"),
    ];

    if (companyOrganizationId) {
      organizationConditions.push(
        eq(organizations.parentOrganizationId, companyOrganizationId),
      );
    }

    const [restaurant] = await tx
      .select({ id: organizations.id, timezone: organizations.timezone })
      .from(organizations)
      .where(and(...organizationConditions))
      .limit(1);

    if (!restaurant) {
      return null;
    }

    const now = new Date();
    const rateBps = Math.round(parsed.defaultTaxRatePercent * 100);
    const [profile] = await tx
      .insert(organizationTaxProfiles)
      .values({
        organizationId: restaurantOrganizationId,
        taxSystem: parsed.taxSystem,
        pricingMode: parsed.pricingMode,
        registrationStatus: parsed.registrationStatus,
        registrationNumber: parsed.registrationNumber,
        legalName: parsed.legalName,
        addressLine1: parsed.addressLine1,
        addressLine2: parsed.addressLine2,
        city: parsed.city,
        region: parsed.region,
        postalCode: parsed.postalCode,
        countryCode: parsed.countryCode,
        defaultTaxRateBps: rateBps,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: organizationTaxProfiles.organizationId,
        set: {
          taxSystem: parsed.taxSystem,
          pricingMode: parsed.pricingMode,
          registrationStatus: parsed.registrationStatus,
          registrationNumber: parsed.registrationNumber,
          legalName: parsed.legalName,
          addressLine1: parsed.addressLine1,
          addressLine2: parsed.addressLine2,
          city: parsed.city,
          region: parsed.region,
          postalCode: parsed.postalCode,
          countryCode: parsed.countryCode,
          defaultTaxRateBps: rateBps,
          updatedAt: now,
        },
      })
      .returning();
    const [existingDefault] = await tx
      .select({ id: organizationTaxDefinitions.id })
      .from(organizationTaxDefinitions)
      .where(
        and(
          eq(
            organizationTaxDefinitions.organizationId,
            restaurantOrganizationId,
          ),
          eq(organizationTaxDefinitions.code, "DEFAULT"),
        ),
      )
      .limit(1);

    if (parsed.taxSystem === "NONE") {
      if (existingDefault) {
        await tx
          .delete(organizationDefaultTaxes)
          .where(
            and(
              eq(
                organizationDefaultTaxes.organizationId,
                restaurantOrganizationId,
              ),
              eq(
                organizationDefaultTaxes.taxDefinitionId,
                existingDefault.id,
              ),
            ),
          );
        await tx
          .update(organizationTaxDefinitions)
          .set({ isActive: false, updatedAt: now })
          .where(eq(organizationTaxDefinitions.id, existingDefault.id));
      }

      return profile ?? null;
    }

    const taxName =
      parsed.taxSystem === "SALES_TAX"
        ? "Sales tax"
        : parsed.taxSystem === "OTHER"
          ? "Tax"
          : parsed.taxSystem;
    const [definition] = await tx
      .insert(organizationTaxDefinitions)
      .values({
        organizationId: restaurantOrganizationId,
        code: "DEFAULT",
        name: taxName,
        treatment: rateBps === 0 ? "ZERO_RATED" : "TAXABLE",
        isActive: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          organizationTaxDefinitions.organizationId,
          organizationTaxDefinitions.code,
        ],
        set: {
          name: taxName,
          treatment: rateBps === 0 ? "ZERO_RATED" : "TAXABLE",
          isActive: true,
          updatedAt: now,
        },
      })
      .returning({ id: organizationTaxDefinitions.id });

    if (!definition) {
      throw new Error("The default tax definition could not be saved.");
    }

    const effectiveFrom = getDateForTimezone(restaurant.timezone);
    await tx
      .update(organizationTaxRates)
      .set({
        effectiveTo: getPreviousDate(effectiveFrom),
        updatedAt: now,
      })
      .where(
        and(
          eq(organizationTaxRates.taxDefinitionId, definition.id),
          lt(organizationTaxRates.effectiveFrom, effectiveFrom),
          or(
            isNull(organizationTaxRates.effectiveTo),
            gte(organizationTaxRates.effectiveTo, effectiveFrom),
          ),
        ),
      );
    await tx
      .insert(organizationTaxRates)
      .values({
        organizationId: restaurantOrganizationId,
        taxDefinitionId: definition.id,
        rateBps,
        effectiveFrom,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          organizationTaxRates.taxDefinitionId,
          organizationTaxRates.effectiveFrom,
        ],
        set: { rateBps, effectiveTo: null, updatedAt: now },
      });
    await tx
      .insert(organizationDefaultTaxes)
      .values({
        organizationId: restaurantOrganizationId,
        taxDefinitionId: definition.id,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: [
          organizationDefaultTaxes.organizationId,
          organizationDefaultTaxes.taxDefinitionId,
        ],
        set: { sortOrder: 0 },
      });

    return profile ?? null;
  });
}
