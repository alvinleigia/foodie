import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations, organizationTaxProfiles } from "@/db/schema";
import { restaurantTaxProfileSchema } from "@/lib/validations/restaurant-tax-profile";

export type RestaurantTaxPricing = {
  pricingMode: "INCLUSIVE" | "EXCLUSIVE";
  taxRateBps: number;
};

export const defaultRestaurantTaxPricing: RestaurantTaxPricing = {
  pricingMode: "INCLUSIVE",
  taxRateBps: 0,
};

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
  const organizationConditions = [
    eq(organizations.id, restaurantOrganizationId),
    eq(organizations.type, "RESTAURANT"),
  ];

  if (companyOrganizationId) {
    organizationConditions.push(
      eq(organizations.parentOrganizationId, companyOrganizationId),
    );
  }

  const [restaurant] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(...organizationConditions))
    .limit(1);

  if (!restaurant) {
    return null;
  }

  const now = new Date();
  const [profile] = await getDb()
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
      defaultTaxRateBps: Math.round(parsed.defaultTaxRatePercent * 100),
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
        defaultTaxRateBps: Math.round(parsed.defaultTaxRatePercent * 100),
        updatedAt: now,
      },
    })
    .returning();

  return profile ?? null;
}
