import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizationOAuthSettings } from "@/db/schema";
import type {
  OrganizationOAuthSettingsSnapshot,
  SocialAuthProvider,
} from "@/lib/organization-integration-types";
import { getOrganizationIntegrationScope } from "@/lib/organization-integration-scope";
import {
  decryptTenantCredential,
  encryptTenantCredential,
  getTenantCredentialHint,
} from "@/lib/tenant-credential-encryption";
import { organizationOAuthSettingsSchema } from "@/lib/validations/organization-integrations";

export class OAuthIntegrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthIntegrationConfigurationError";
  }
}

export type ResolvedOAuthIntegration =
  | {
      status: "CONFIGURED";
      provider: SocialAuthProvider;
      clientId: string;
      clientSecret: string;
      source: "ORGANIZATION" | "PLATFORM_DEFAULT";
      organizationId: string | null;
      organizationName: string;
    }
  | {
      status: "DISABLED" | "UNAVAILABLE";
      provider: SocialAuthProvider;
      reason: "DISABLED" | "INCOMPLETE" | "NO_CONFIGURATION";
      source: "ORGANIZATION" | "NONE";
      organizationId: string | null;
      organizationName: string;
    };

function getCredentialPurpose(provider: SocialAuthProvider) {
  return `oauth-${provider.toLowerCase()}-client-secret`;
}

export function getPlatformOAuthCredentials(provider: SocialAuthProvider) {
  const environmentNames = {
    GOOGLE: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
    APPLE: ["AUTH_APPLE_ID", "AUTH_APPLE_SECRET"],
    FACEBOOK: ["AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET"],
  } as const;
  const [idName, secretName] = environmentNames[provider];
  const clientId = process.env[idName]?.trim();
  const clientSecret = process.env[secretName]?.trim();

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function getOrganization(organizationId: string) {
  const scope = await getOrganizationIntegrationScope(organizationId);

  if (!scope) {
    throw new OAuthIntegrationConfigurationError(
      "OAuth integrations are only available to companies and restaurants.",
    );
  }

  return scope;
}

export async function resolveOrganizationOAuthIntegration(
  organizationId: string,
  provider: SocialAuthProvider,
): Promise<ResolvedOAuthIntegration> {
  const scope = await getOrganization(organizationId);

  for (const organization of scope.lineage) {
    const [settings] = await getDb()
      .select()
      .from(organizationOAuthSettings)
      .where(
        and(
          eq(organizationOAuthSettings.organizationId, organization.id),
          eq(organizationOAuthSettings.provider, provider),
        ),
      )
      .limit(1);

    if (settings?.mode === "DISABLED") {
      return {
        status: "DISABLED",
        provider,
        reason: "DISABLED",
        source: "ORGANIZATION",
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }

    if (settings?.mode === "CUSTOM") {
      if (!settings.clientId?.trim() || !settings.clientSecretEncrypted) {
        return {
          status: "UNAVAILABLE",
          provider,
          reason: "INCOMPLETE",
          source: "ORGANIZATION",
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      return {
        status: "CONFIGURED",
        provider,
        clientId: settings.clientId.trim(),
        clientSecret: decryptTenantCredential(
          settings.clientSecretEncrypted,
          organization.id,
          getCredentialPurpose(provider),
        ),
        source: "ORGANIZATION",
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }
  }

  const platformCredentials = getPlatformOAuthCredentials(provider);

  if (platformCredentials) {
    return {
      status: "CONFIGURED",
      provider,
      ...platformCredentials,
      source: "PLATFORM_DEFAULT",
      organizationId: null,
      organizationName: "Foodie platform",
    };
  }

  return {
    status: "UNAVAILABLE",
    provider,
    reason: "NO_CONFIGURATION",
    source: "NONE",
    organizationId: null,
    organizationName: "No configuration",
  };
}

export async function getOrganizationOAuthSettingsSnapshot(
  organizationId: string,
  provider: SocialAuthProvider,
): Promise<OrganizationOAuthSettingsSnapshot> {
  const { organization, parent } = await getOrganization(organizationId);
  const [settings, effective] = await Promise.all([
    getDb()
      .select()
      .from(organizationOAuthSettings)
      .where(
        and(
          eq(organizationOAuthSettings.organizationId, organization.id),
          eq(organizationOAuthSettings.provider, provider),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    resolveOrganizationOAuthIntegration(organization.id, provider),
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
      provider,
      mode: settings?.mode ?? "INHERIT",
      clientId: settings?.clientId ?? "",
      hasClientSecret: Boolean(settings?.clientSecretEncrypted),
      clientSecretHint: settings?.clientSecretHint ?? null,
    },
    effective: {
      status: effective.status,
      source: effective.source,
      sourceOrganizationId: effective.organizationId,
      sourceOrganizationName: effective.organizationName,
      reason: effective.status === "CONFIGURED" ? null : effective.reason,
    },
  };
}

export async function getOrganizationOAuthSettingsSnapshots(organizationId: string) {
  return Promise.all(
    (["GOOGLE", "APPLE", "FACEBOOK"] as const).map((provider) =>
      getOrganizationOAuthSettingsSnapshot(organizationId, provider),
    ),
  );
}

export async function updateOrganizationOAuthSettings(
  organizationId: string,
  input: unknown,
  updatedByUserId: string,
) {
  const parsed = organizationOAuthSettingsSchema.parse(input);
  const { organization } = await getOrganization(organizationId);
  const [existing] = await getDb()
    .select()
    .from(organizationOAuthSettings)
    .where(
      and(
        eq(organizationOAuthSettings.organizationId, organization.id),
        eq(organizationOAuthSettings.provider, parsed.provider),
      ),
    )
    .limit(1);
  const clientSecretEncrypted = parsed.clientSecret
    ? encryptTenantCredential(
        parsed.clientSecret,
        organization.id,
        getCredentialPurpose(parsed.provider),
      )
    : existing?.clientSecretEncrypted ?? null;
  const clientSecretHint = parsed.clientSecret
    ? getTenantCredentialHint(parsed.clientSecret)
    : existing?.clientSecretHint ?? null;

  if (parsed.mode === "CUSTOM" && (!parsed.clientId || !clientSecretEncrypted)) {
    throw new OAuthIntegrationConfigurationError(
      "Add the client ID and client secret before enabling custom login.",
    );
  }

  const now = new Date();

  await getDb()
    .insert(organizationOAuthSettings)
    .values({
      organizationId: organization.id,
      provider: parsed.provider,
      mode: parsed.mode,
      clientId: parsed.clientId,
      clientSecretEncrypted,
      clientSecretHint,
      updatedByUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        organizationOAuthSettings.organizationId,
        organizationOAuthSettings.provider,
      ],
      set: {
        mode: parsed.mode,
        clientId: parsed.clientId,
        clientSecretEncrypted,
        clientSecretHint,
        updatedByUserId,
        updatedAt: now,
      },
    });

  return getOrganizationOAuthSettingsSnapshot(organization.id, parsed.provider);
}
