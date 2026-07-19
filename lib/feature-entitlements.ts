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
  key: FeatureKey;
  name: string;
  override: FeatureEntitlementOverride | null;
  source: FeatureEntitlementSource;
};

export type FeatureEntitlementOverride = {
  enabled: boolean;
  expiresAt: string | null;
  reason: string | null;
};

export type FeatureOverrideMode = "INHERIT" | "ENABLED" | "DISABLED";

export type FeatureOverrideUpdate = {
  expiresAt: Date | null;
  featureKey: FeatureKey;
  mode: FeatureOverrideMode;
  reason: string | null;
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
      .where(
        and(
          eq(saasFeatures.isActive, true),
          inArray(saasFeatures.key, featureKeys),
        ),
      ),
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
        expiresAt: organizationFeatureOverrides.expiresAt,
        featureId: organizationFeatureOverrides.featureId,
        organizationId: organizationFeatureOverrides.organizationId,
        reason: organizationFeatureOverrides.reason,
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
      .map((override) => [override.featureId, override]),
  );
  const restaurantOverridesByFeatureId = new Map(
    overrides
      .filter(
        (override) => override.organizationId === restaurantOrganizationId,
      )
      .map((override) => [override.featureId, override]),
  );

  return features.map((feature) => {
    const companyOverride = companyOverridesByFeatureId.get(feature.id);
    const restaurantOverride = restaurantOverridesByFeatureId.get(feature.id);
    const scopeOverride = restaurantOrganizationId
      ? restaurantOverride
      : companyOverride;
    const resolution = resolveFeatureEntitlement({
      companyOverride: companyOverride?.enabled,
      defaultEnabled: feature.defaultEnabled,
      planEnabled: planByFeatureId.get(feature.id),
      restaurantOverride: restaurantOverride?.enabled,
    });

    return {
      category: feature.category,
      description: feature.description,
      enabled: resolution.enabled,
      featureId: feature.id,
      key: feature.key as FeatureKey,
      name: feature.name,
      override: scopeOverride
        ? {
            enabled: scopeOverride.enabled,
            expiresAt: scopeOverride.expiresAt?.toISOString() ?? null,
            reason: scopeOverride.reason,
          }
        : null,
      source: resolution.source,
    };
  });
}

export async function updateOrganizationFeatureOverrides(
  organizationId: string,
  updates: FeatureOverrideUpdate[],
  updatedByUserId: string | null,
) {
  await getEntitlementScope(organizationId);

  const requestedFeatureKeys = [...new Set(updates.map((update) => update.featureKey))];
  const features = await getDb()
    .select({ id: saasFeatures.id, key: saasFeatures.key })
    .from(saasFeatures)
    .where(
      and(
        eq(saasFeatures.isActive, true),
        inArray(saasFeatures.key, requestedFeatureKeys),
      ),
    );

  if (features.length !== requestedFeatureKeys.length) {
    throw new FeatureEntitlementError(
      "One or more features are not available in the feature catalogue.",
    );
  }

  const featureIdByKey = new Map(
    features.map((feature) => [feature.key, feature.id]),
  );
  const now = new Date();

  await getDb().transaction(async (transaction) => {
    for (const update of updates) {
      const featureId = featureIdByKey.get(update.featureKey);

      if (!featureId) {
        throw new FeatureEntitlementError(
          `Feature ${update.featureKey} is not configured.`,
        );
      }

      if (update.mode === "INHERIT") {
        await transaction
          .delete(organizationFeatureOverrides)
          .where(
            and(
              eq(organizationFeatureOverrides.organizationId, organizationId),
              eq(organizationFeatureOverrides.featureId, featureId),
            ),
          );
        continue;
      }

      const enabled = update.mode === "ENABLED";
      await transaction
        .insert(organizationFeatureOverrides)
        .values({
          organizationId,
          featureId,
          enabled,
          reason: update.reason,
          expiresAt: update.expiresAt,
          updatedByUserId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            organizationFeatureOverrides.organizationId,
            organizationFeatureOverrides.featureId,
          ],
          set: {
            enabled,
            reason: update.reason,
            expiresAt: update.expiresAt,
            updatedByUserId,
            updatedAt: now,
          },
        });
    }
  });

  return listOrganizationFeatureEntitlements(organizationId);
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
