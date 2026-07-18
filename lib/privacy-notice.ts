import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context";

const PRIVACY_PLACEHOLDER_PREFIX = "[REPLACE BEFORE PUBLIC LAUNCH:";

function configuredValue(value: string | undefined, description: string) {
  return value?.trim() || `${PRIVACY_PLACEHOLDER_PREFIX} ${description}]`;
}

export function isPrivacyPlaceholder(value: string) {
  return value.startsWith(PRIVACY_PLACEHOLDER_PREFIX);
}

export type PrivacyNoticeTenantIdentity = {
  controllerDisplayName: string;
  controllerSlug: string;
  restaurantName: string | null;
};

export type PrivacyNoticeConfiguration = {
  controller: {
    address: string;
    displayName: string;
    email: string;
    legalName: string;
  };
  effectiveDate: string;
  internationalTransfers: string;
  isDraft: boolean;
  platform: {
    address: string;
    email: string;
    icoRegistrationNumber: string;
    legalName: string;
  };
  restaurantName: string | null;
  retention: Array<{
    category: string;
    period: string;
  }>;
};

export async function getPrivacyNoticeTenantIdentity(
  context: TenantContext,
): Promise<PrivacyNoticeTenantIdentity | null> {
  const db = getDb();
  const [organization] = await db
    .select({
      name: organizations.name,
      parentOrganizationId: organizations.parentOrganizationId,
      slug: organizations.slug,
      type: organizations.type,
    })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  if (!organization) {
    return null;
  }

  const [company] = organization.parentOrganizationId
    ? await db
        .select({
          name: organizations.name,
          slug: organizations.slug,
        })
        .from(organizations)
        .where(eq(organizations.id, organization.parentOrganizationId))
        .limit(1)
    : [];

  return {
    controllerDisplayName: company?.name ?? organization.name,
    controllerSlug: company?.slug ?? organization.slug,
    restaurantName:
      organization.type === "RESTAURANT" ? organization.name : null,
  };
}

export function getPrivacyNoticeConfiguration(
  identity: PrivacyNoticeTenantIdentity | null,
): PrivacyNoticeConfiguration {
  const controllerDisplayName =
    identity?.controllerDisplayName ?? "the ordering business";
  const effectiveDate = configuredValue(
    process.env.PRIVACY_NOTICE_EFFECTIVE_DATE,
    "notice effective date, for example 18 July 2026",
  );
  const platform = {
    address: configuredValue(
      process.env.PRIVACY_PLATFORM_ADDRESS,
      "platform registered office address",
    ),
    email: configuredValue(
      process.env.PRIVACY_PLATFORM_EMAIL,
      "platform privacy contact email",
    ),
    icoRegistrationNumber: configuredValue(
      process.env.PRIVACY_PLATFORM_ICO_NUMBER,
      "platform ICO registration number or state not applicable",
    ),
    legalName: configuredValue(
      process.env.PRIVACY_PLATFORM_LEGAL_NAME,
      "platform legal entity name",
    ),
  };
  const controller = {
    address: configuredValue(
      process.env.PRIVACY_CONTROLLER_ADDRESS,
      `registered or business address for ${controllerDisplayName}`,
    ),
    displayName: controllerDisplayName,
    email: configuredValue(
      process.env.PRIVACY_CONTROLLER_EMAIL,
      `privacy contact email for ${controllerDisplayName}`,
    ),
    legalName: configuredValue(
      process.env.PRIVACY_CONTROLLER_LEGAL_NAME,
      `legal entity name for ${controllerDisplayName}`,
    ),
  };
  const internationalTransfers = configuredValue(
    process.env.PRIVACY_INTERNATIONAL_TRANSFERS,
    "international transfer locations and safeguards",
  );
  const retention = [
    {
      category: "Customer account and profile",
      period: configuredValue(
        process.env.PRIVACY_RETENTION_PROFILE,
        "profile retention period after the last account activity",
      ),
    },
    {
      category: "Email sign-in codes and authentication handoffs",
      period: configuredValue(
        process.env.PRIVACY_RETENTION_AUTH,
        "short operational retention period after expiry",
      ),
    },
    {
      category: "Orders, payments, cancellations and refunds",
      period: configuredValue(
        process.env.PRIVACY_RETENTION_ORDERS,
        "financial and order record retention period",
      ),
    },
    {
      category: "Security and audit records",
      period: configuredValue(
        process.env.PRIVACY_RETENTION_SECURITY,
        "security and audit record retention period",
      ),
    },
    {
      category: "Marketing consent and suppression records",
      period: configuredValue(
        process.env.PRIVACY_RETENTION_MARKETING,
        "marketing consent and opt-out retention period",
      ),
    },
  ];
  const configuredValues = [
    effectiveDate,
    internationalTransfers,
    platform.address,
    platform.email,
    platform.icoRegistrationNumber,
    platform.legalName,
    controller.address,
    controller.email,
    controller.legalName,
    ...retention.map((entry) => entry.period),
  ];

  return {
    controller,
    effectiveDate,
    internationalTransfers,
    isDraft: configuredValues.some(isPrivacyPlaceholder),
    platform,
    restaurantName: identity?.restaurantName ?? null,
    retention,
  };
}
