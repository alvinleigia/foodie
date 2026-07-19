import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizationFeatureOverrides,
  organizationSubscriptions,
  organizations,
  saasFeatures,
  saasPlanFeatures,
} from "@/db/schema";

export const featureKeys = [
  "ordering.customer",
  "ordering.customer_accounts",
  "auth.social",
  "payments.stripe",
  "payments.staff_billing",
  "operations.inventory",
  "reports.operational",
  "branding.custom_domains",
] as const;

export type FeatureKey = (typeof featureKeys)[number];

export type FeatureEntitlementSource =
  | "RESTAURANT_OVERRIDE"
  | "COMPANY_OVERRIDE"
  | "PLAN"
  | "DEFAULT";

export type FeatureEntitlement = {
  category: string;
  description: string | null;
  enabled: boolean;
  featureId: string;
  key: string;
  name: string;
  source: FeatureEntitlementSource;
};

type ResolveFeatureEntitlementInput = {
  companyOverride?: boolean | null;
  defaultEnabled: boolean;
  planEnabled?: boolean | null;
  restaurantOverride?: boolean | null;
};

export class FeatureEntitlementError extends Error {}

export function resolveFeatureEntitlement({
  companyOverride,
  defaultEnabled,
  planEnabled,
  restaurantOverride,
}: ResolveFeatureEntitlementInput): {
  enabled: boolean;
  source: FeatureEntitlementSource;
} {
  if (restaurantOverride !== null && restaurantOverride !== undefined) {
    return {
      enabled: restaurantOverride,
      source: "RESTAURANT_OVERRIDE",
    };
  }

  if (companyOverride !== null && companyOverride !== undefined) {
    return {
      enabled: companyOverride,
      source: "COMPANY_OVERRIDE",
    };
  }

  if (planEnabled !== null && planEnabled !== undefined) {
    return {
      enabled: planEnabled,
      source: "PLAN",
    };
  }

  return {
    enabled: defaultEnabled,
    source: "DEFAULT",
  };
}

async function getEntitlementScope(organizationId: string) {
  const [organization] = await getDb()
    .select({
      id: organizations.id,
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization || organization.type === "PLATFORM") {
    throw new FeatureEntitlementError(
      "Feature entitlements require a company or restaurant organization.",
    );
  }

  const companyOrganizationId =
    organization.type === "COMPANY"
      ? organization.id
      : organization.parentOrganizationId;

  if (!companyOrganizationId) {
    throw new FeatureEntitlementError(
      "The restaurant is not linked to a company organization.",
    );
  }

  return {
    companyOrganizationId,
    restaurantOrganizationId:
      organization.type === "RESTAURANT" ? organization.id : null,
  };
}

export async function listOrganizationFeatureEntitlements(
  organizationId: string,
  evaluatedAt = new Date(),
): Promise<FeatureEntitlement[]> {
  const { companyOrganizationId, restaurantOrganizationId } =
    await getEntitlementScope(organizationId);
  const overrideOrganizationIds = restaurantOrganizationId
    ? [companyOrganizationId, restaurantOrganizationId]
    : [companyOrganizationId];

  const [features, planFeatures, overrides] = await Promise.all([
    getDb()
      .select({
        category: saasFeatures.category,
        defaultEnabled: saasFeatures.defaultEnabled,
        description: saasFeatures.description,
        id: saasFeatures.id,
        key: saasFeatures.key,
        name: saasFeatures.name,
      })
      .from(saasFeatures)
      .where(eq(saasFeatures.isActive, true)),
    getDb()
      .select({
        enabled: saasPlanFeatures.enabled,
        featureId: saasPlanFeatures.featureId,
      })
      .from(saasPlanFeatures)
      .innerJoin(
        organizationSubscriptions,
        eq(organizationSubscriptions.planId, saasPlanFeatures.planId),
      )
      .where(
        eq(
          organizationSubscriptions.organizationId,
          companyOrganizationId,
        ),
      ),
    getDb()
      .select({
        enabled: organizationFeatureOverrides.enabled,
        featureId: organizationFeatureOverrides.featureId,
        organizationId: organizationFeatureOverrides.organizationId,
      })
      .from(organizationFeatureOverrides)
      .where(
        and(
          inArray(
            organizationFeatureOverrides.organizationId,
            overrideOrganizationIds,
          ),
          or(
            isNull(organizationFeatureOverrides.expiresAt),
            gt(organizationFeatureOverrides.expiresAt, evaluatedAt),
          ),
        ),
      ),
  ]);

  const planByFeatureId = new Map(
    planFeatures.map((feature) => [feature.featureId, feature.enabled]),
  );
  const companyOverridesByFeatureId = new Map(
    overrides
      .filter(
        (override) => override.organizationId === companyOrganizationId,
      )
      .map((override) => [override.featureId, override.enabled]),
  );
  const restaurantOverridesByFeatureId = new Map(
    overrides
      .filter(
        (override) => override.organizationId === restaurantOrganizationId,
      )
      .map((override) => [override.featureId, override.enabled]),
  );

  return features.map((feature) => {
    const resolution = resolveFeatureEntitlement({
      companyOverride: companyOverridesByFeatureId.get(feature.id),
      defaultEnabled: feature.defaultEnabled,
      planEnabled: planByFeatureId.get(feature.id),
      restaurantOverride: restaurantOverridesByFeatureId.get(feature.id),
    });

    return {
      category: feature.category,
      description: feature.description,
      enabled: resolution.enabled,
      featureId: feature.id,
      key: feature.key,
      name: feature.name,
      source: resolution.source,
    };
  });
}

export async function getOrganizationFeatureEntitlement(
  organizationId: string,
  featureKey: FeatureKey,
) {
  const entitlements = await listOrganizationFeatureEntitlements(organizationId);
  const entitlement = entitlements.find(
    (candidate) => candidate.key === featureKey,
  );

  if (!entitlement) {
    throw new FeatureEntitlementError(
      `Feature ${featureKey} is not configured in the feature catalogue.`,
    );
  }

  return entitlement;
}

export async function assertOrganizationFeatureEnabled(
  organizationId: string,
  featureKey: FeatureKey,
) {
  const entitlement = await getOrganizationFeatureEntitlement(
    organizationId,
    featureKey,
  );

  if (!entitlement.enabled) {
    throw new FeatureEntitlementError(
      `${entitlement.name} is not enabled for this organization.`,
    );
  }

  return entitlement;
}
