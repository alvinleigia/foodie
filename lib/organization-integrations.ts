import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizationEmailSettings,
  organizationPaymentAccounts,
  organizations,
} from "@/db/schema";
import { decryptTenantCredential } from "@/lib/tenant-credential-encryption";

const maximumOrganizationDepth = 8;
const smtp2goCredentialPurpose = "smtp2go-api-key";

type IntegrationSource = {
  organizationId: string | null;
  organizationName: string;
};

export type ResolvedEmailIntegration =
  | ({
      status: "CONFIGURED";
      provider: "SMTP2GO";
      apiKey: string;
      sender: string;
      replyToEmail: string | null;
      source: "ORGANIZATION" | "PLATFORM_DEFAULT";
    } & IntegrationSource)
  | ({
      status: "DISABLED" | "UNAVAILABLE";
      reason: "DISABLED" | "INCOMPLETE" | "NOT_VERIFIED" | "NO_CONFIGURATION";
      source: "ORGANIZATION" | "NONE";
    } & IntegrationSource);

export type ResolvedPaymentIntegration =
  | {
      status: "CONFIGURED";
      provider: "STRIPE";
      stripeAccountId: string;
      applicationFeeBps: number;
      organizationId: string;
      organizationName: string;
    }
  | ({
      status: "DISABLED" | "UNAVAILABLE";
      reason: "DISABLED" | "INCOMPLETE" | "ONBOARDING_INCOMPLETE" | "NO_CONFIGURATION";
    } & IntegrationSource);

function formatSender(fromName: string | null, fromEmail: string) {
  return fromName?.trim() ? `${fromName.trim()} <${fromEmail.trim()}>` : fromEmail.trim();
}

async function getOrganizationNode(organizationId: string) {
  const [organization] = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      parentOrganizationId: organizations.parentOrganizationId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return organization ?? null;
}

export async function resolveOrganizationEmailIntegration(
  organizationId: string,
): Promise<ResolvedEmailIntegration> {
  const visitedOrganizationIds = new Set<string>();
  let currentOrganizationId: string | null = organizationId;

  for (let depth = 0; currentOrganizationId && depth < maximumOrganizationDepth; depth += 1) {
    if (visitedOrganizationIds.has(currentOrganizationId)) {
      throw new Error("Organization hierarchy contains a cycle.");
    }

    visitedOrganizationIds.add(currentOrganizationId);
    const organization = await getOrganizationNode(currentOrganizationId);

    if (!organization) {
      break;
    }

    const [settings] = await getDb()
      .select()
      .from(organizationEmailSettings)
      .where(eq(organizationEmailSettings.organizationId, organization.id))
      .limit(1);

    if (settings?.mode === "DISABLED") {
      return {
        status: "DISABLED",
        reason: "DISABLED",
        source: "ORGANIZATION",
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }

    if (settings?.mode === "CUSTOM") {
      if (
        !settings.fromEmail?.trim() ||
        !settings.apiKeyEncrypted ||
        settings.provider !== "SMTP2GO"
      ) {
        return {
          status: "UNAVAILABLE",
          reason: "INCOMPLETE",
          source: "ORGANIZATION",
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      if (settings.verificationStatus !== "VERIFIED") {
        return {
          status: "UNAVAILABLE",
          reason: "NOT_VERIFIED",
          source: "ORGANIZATION",
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      return {
        status: "CONFIGURED",
        provider: "SMTP2GO",
        apiKey: decryptTenantCredential(
          settings.apiKeyEncrypted,
          organization.id,
          smtp2goCredentialPurpose,
        ),
        sender: formatSender(settings.fromName, settings.fromEmail),
        replyToEmail: settings.replyToEmail?.trim() || null,
        source: "ORGANIZATION",
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }

    currentOrganizationId = organization.parentOrganizationId;
  }

  if (currentOrganizationId) {
    throw new Error("Organization hierarchy exceeds the supported depth.");
  }

  const apiKey = process.env.SMTP2GO_API_KEY;
  const sender = process.env.EMAIL_FROM;

  if (apiKey && sender) {
    return {
      status: "CONFIGURED",
      provider: "SMTP2GO",
      apiKey,
      sender,
      replyToEmail: null,
      source: "PLATFORM_DEFAULT",
      organizationId: null,
      organizationName: "Platform default",
    };
  }

  return {
    status: "UNAVAILABLE",
    reason: "NO_CONFIGURATION",
    source: "NONE",
    organizationId: null,
    organizationName: "No configuration",
  };
}

export async function resolveOrganizationPaymentIntegration(
  organizationId: string,
): Promise<ResolvedPaymentIntegration> {
  const visitedOrganizationIds = new Set<string>();
  let currentOrganizationId: string | null = organizationId;

  for (let depth = 0; currentOrganizationId && depth < maximumOrganizationDepth; depth += 1) {
    if (visitedOrganizationIds.has(currentOrganizationId)) {
      throw new Error("Organization hierarchy contains a cycle.");
    }

    visitedOrganizationIds.add(currentOrganizationId);
    const organization = await getOrganizationNode(currentOrganizationId);

    if (!organization) {
      break;
    }

    const [account] = await getDb()
      .select()
      .from(organizationPaymentAccounts)
      .where(eq(organizationPaymentAccounts.organizationId, organization.id))
      .limit(1);

    if (account?.mode === "DISABLED") {
      return {
        status: "DISABLED",
        reason: "DISABLED",
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }

    if (account?.mode === "CUSTOM") {
      if (!account.stripeAccountId || account.provider !== "STRIPE") {
        return {
          status: "UNAVAILABLE",
          reason: "INCOMPLETE",
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      if (account.onboardingStatus !== "COMPLETE" || !account.chargesEnabled) {
        return {
          status: "UNAVAILABLE",
          reason: "ONBOARDING_INCOMPLETE",
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      return {
        status: "CONFIGURED",
        provider: "STRIPE",
        stripeAccountId: account.stripeAccountId,
        applicationFeeBps: account.applicationFeeBps,
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }

    currentOrganizationId = organization.parentOrganizationId;
  }

  if (currentOrganizationId) {
    throw new Error("Organization hierarchy exceeds the supported depth.");
  }

  return {
    status: "UNAVAILABLE",
    reason: "NO_CONFIGURATION",
    organizationId: null,
    organizationName: "No configuration",
  };
}

export { smtp2goCredentialPurpose };
