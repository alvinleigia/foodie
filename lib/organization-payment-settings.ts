import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "@/db";
import { organizationPaymentAccounts, organizations } from "@/db/schema";
import type { OrganizationPaymentSettingsSnapshot } from "@/lib/organization-integration-types";
import { resolveOrganizationPaymentIntegration } from "@/lib/organization-integrations";
import { getStripe } from "@/lib/stripe";
import { organizationPaymentSettingsSchema } from "@/lib/validations/organization-integrations";

export class PaymentIntegrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentIntegrationConfigurationError";
  }
}

async function getOrganization(organizationId: string) {
  const [organization] = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new PaymentIntegrationConfigurationError("Organization not found.");
  }

  return organization;
}

function getOnboardingStatus(account: Stripe.Account) {
  if (account.charges_enabled && account.details_submitted) {
    return "COMPLETE" as const;
  }

  if (account.requirements?.disabled_reason) {
    return "RESTRICTED" as const;
  }

  return "PENDING" as const;
}

export async function syncOrganizationStripeAccount(organizationId: string) {
  const [settings] = await getDb()
    .select()
    .from(organizationPaymentAccounts)
    .where(eq(organizationPaymentAccounts.organizationId, organizationId))
    .limit(1);

  if (!settings?.stripeAccountId) {
    throw new PaymentIntegrationConfigurationError("Connect a Stripe account first.");
  }

  const account = await getStripe().accounts.retrieve(settings.stripeAccountId);

  if (account.deleted) {
    await getDb()
      .update(organizationPaymentAccounts)
      .set({
        onboardingStatus: "RESTRICTED",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationPaymentAccounts.organizationId, organizationId));
  } else {
    await getDb()
      .update(organizationPaymentAccounts)
      .set({
        onboardingStatus: getOnboardingStatus(account),
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationPaymentAccounts.organizationId, organizationId));
  }

  return getOrganizationPaymentSettingsSnapshot(organizationId);
}

export async function syncStripeAccountFromWebhook(account: Stripe.Account) {
  const now = new Date();

  await getDb()
    .update(organizationPaymentAccounts)
    .set({
      onboardingStatus: getOnboardingStatus(account),
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(organizationPaymentAccounts.stripeAccountId, account.id));
}

export async function getOrganizationPaymentSettingsSnapshot(
  organizationId: string,
): Promise<OrganizationPaymentSettingsSnapshot> {
  const organization = await getOrganization(organizationId);
  const [parent, settings, effective] = await Promise.all([
    organization.parentOrganizationId
      ? getOrganization(organization.parentOrganizationId)
      : Promise.resolve(null),
    getDb()
      .select()
      .from(organizationPaymentAccounts)
      .where(eq(organizationPaymentAccounts.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    resolveOrganizationPaymentIntegration(organization.id),
  ]);

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      type: organization.type,
    },
    parent: parent
      ? { id: parent.id, name: parent.name, type: parent.type }
      : null,
    settings: {
      mode: settings?.mode ?? "INHERIT",
      provider: settings?.provider ?? "STRIPE",
      stripeAccountId: settings?.stripeAccountId ?? null,
      onboardingStatus: settings?.onboardingStatus ?? "NOT_STARTED",
      chargesEnabled: settings?.chargesEnabled ?? false,
      payoutsEnabled: settings?.payoutsEnabled ?? false,
      detailsSubmitted: settings?.detailsSubmitted ?? false,
      lastSyncedAt: settings?.lastSyncedAt?.toISOString() ?? null,
    },
    effective: {
      status: effective.status,
      sourceOrganizationId: effective.organizationId,
      sourceOrganizationName: effective.organizationName,
      stripeAccountId:
        effective.status === "CONFIGURED" ? effective.stripeAccountId : null,
      reason: effective.status === "CONFIGURED" ? null : effective.reason,
    },
  };
}

export async function updateOrganizationPaymentSettings(
  organizationId: string,
  input: unknown,
  updatedByUserId: string,
) {
  const parsed = organizationPaymentSettingsSchema.parse(input);
  const organization = await getOrganization(organizationId);
  const now = new Date();

  await getDb()
    .insert(organizationPaymentAccounts)
    .values({
      organizationId: organization.id,
      mode: parsed.mode,
      updatedByUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizationPaymentAccounts.organizationId,
      set: {
        mode: parsed.mode,
        updatedByUserId,
        updatedAt: now,
      },
    });

  return getOrganizationPaymentSettingsSnapshot(organization.id);
}

export async function startOrganizationStripeOnboarding(input: {
  organizationId: string;
  contactEmail: string;
  origin: string;
  returnPath: string;
  refreshPath: string;
  updatedByUserId: string;
}) {
  const organization = await getOrganization(input.organizationId);
  const [existing] = await getDb()
    .select()
    .from(organizationPaymentAccounts)
    .where(eq(organizationPaymentAccounts.organizationId, organization.id))
    .limit(1);
  const stripe = getStripe();
  const account = existing?.stripeAccountId
    ? await stripe.accounts.retrieve(existing.stripeAccountId)
    : await stripe.accounts.create(
        {
          type: "express",
          email: input.contactEmail,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_profile: { name: organization.name },
          metadata: { organizationId: organization.id },
        },
        { idempotencyKey: `organization-connect-account-${organization.id}` },
      );

  if (account.deleted) {
    throw new PaymentIntegrationConfigurationError(
      "The connected Stripe account is no longer available.",
    );
  }

  const now = new Date();
  await getDb()
    .insert(organizationPaymentAccounts)
    .values({
      organizationId: organization.id,
      mode: "CUSTOM",
      stripeAccountId: account.id,
      onboardingStatus: getOnboardingStatus(account),
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      lastSyncedAt: now,
      updatedByUserId: input.updatedByUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizationPaymentAccounts.organizationId,
      set: {
        mode: "CUSTOM",
        stripeAccountId: account.id,
        onboardingStatus: getOnboardingStatus(account),
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        lastSyncedAt: now,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      },
    });
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    return_url: new URL(input.returnPath, input.origin).toString(),
    refresh_url: new URL(input.refreshPath, input.origin).toString(),
  });

  return { onboardingUrl: accountLink.url };
}
