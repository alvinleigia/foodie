import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizationEmailSettings, organizations } from "@/db/schema";
import type { OrganizationEmailSettingsSnapshot } from "@/lib/organization-integration-types";
import {
  resolveOrganizationEmailIntegration,
  smtp2goCredentialPurpose,
} from "@/lib/organization-integrations";
import { sendSmtp2goEmail } from "@/lib/smtp2go";
import {
  decryptTenantCredential,
  encryptTenantCredential,
  getTenantCredentialHint,
} from "@/lib/tenant-credential-encryption";
import { organizationEmailSettingsSchema } from "@/lib/validations/organization-integrations";

export class EmailIntegrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailIntegrationConfigurationError";
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
    throw new EmailIntegrationConfigurationError("Organization not found.");
  }

  return organization;
}

export async function getOrganizationEmailSettingsSnapshot(
  organizationId: string,
): Promise<OrganizationEmailSettingsSnapshot> {
  const organization = await getOrganization(organizationId);
  const [parent, settings, effective] = await Promise.all([
    organization.parentOrganizationId
      ? getOrganization(organization.parentOrganizationId)
      : Promise.resolve(null),
    getDb()
      .select()
      .from(organizationEmailSettings)
      .where(eq(organizationEmailSettings.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    resolveOrganizationEmailIntegration(organization.id),
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
      provider: settings?.provider ?? "SMTP2GO",
      fromName: settings?.fromName ?? "",
      fromEmail: settings?.fromEmail ?? "",
      replyToEmail: settings?.replyToEmail ?? "",
      hasApiKey: Boolean(settings?.apiKeyEncrypted),
      apiKeyHint: settings?.apiKeyHint ?? null,
      verificationStatus: settings?.verificationStatus ?? "NOT_CONFIGURED",
      lastTestedAt: settings?.lastTestedAt?.toISOString() ?? null,
    },
    effective: {
      status: effective.status,
      source: effective.source,
      sourceOrganizationId: effective.organizationId,
      sourceOrganizationName: effective.organizationName,
      sender: effective.status === "CONFIGURED" ? effective.sender : null,
      reason: effective.status === "CONFIGURED" ? null : effective.reason,
    },
  };
}

export async function updateOrganizationEmailSettings(
  organizationId: string,
  input: unknown,
  updatedByUserId: string,
) {
  const parsed = organizationEmailSettingsSchema.parse(input);
  const organization = await getOrganization(organizationId);
  const [existing] = await getDb()
    .select()
    .from(organizationEmailSettings)
    .where(eq(organizationEmailSettings.organizationId, organization.id))
    .limit(1);
  const providedApiKey = parsed.mode === "CUSTOM" ? parsed.apiKey : null;
  const apiKeyEncrypted = providedApiKey
    ? encryptTenantCredential(providedApiKey, organization.id, smtp2goCredentialPurpose)
    : existing?.apiKeyEncrypted ?? null;
  const apiKeyHint = providedApiKey
    ? getTenantCredentialHint(providedApiKey)
    : existing?.apiKeyHint ?? null;

  if (parsed.mode === "CUSTOM" && !apiKeyEncrypted) {
    throw new EmailIntegrationConfigurationError(
      "Add an SMTP2GO API key before enabling custom delivery.",
    );
  }

  const configurationChanged = Boolean(
    providedApiKey ||
      existing?.fromName !== parsed.fromName ||
      existing?.fromEmail !== parsed.fromEmail ||
      existing?.replyToEmail !== parsed.replyToEmail,
  );
  const verificationStatus =
    parsed.mode === "CUSTOM" && configurationChanged
      ? "PENDING"
      : existing?.verificationStatus ?? "NOT_CONFIGURED";
  const now = new Date();

  await getDb()
    .insert(organizationEmailSettings)
    .values({
      organizationId: organization.id,
      mode: parsed.mode,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      replyToEmail: parsed.replyToEmail,
      apiKeyEncrypted,
      apiKeyHint,
      verificationStatus,
      updatedByUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizationEmailSettings.organizationId,
      set: {
        mode: parsed.mode,
        fromName: parsed.fromName,
        fromEmail: parsed.fromEmail,
        replyToEmail: parsed.replyToEmail,
        apiKeyEncrypted,
        apiKeyHint,
        verificationStatus,
        updatedByUserId,
        updatedAt: now,
      },
    });

  return getOrganizationEmailSettingsSnapshot(organization.id);
}

export async function testOrganizationEmailSettings(
  organizationId: string,
  recipientEmail: string,
) {
  const organization = await getOrganization(organizationId);
  const [settings] = await getDb()
    .select()
    .from(organizationEmailSettings)
    .where(eq(organizationEmailSettings.organizationId, organization.id))
    .limit(1);
  let delivery: {
    apiKey: string;
    sender: string;
    replyToEmail: string | null;
  };

  if (settings?.mode === "CUSTOM") {
    if (!settings.fromEmail || !settings.apiKeyEncrypted) {
      throw new EmailIntegrationConfigurationError(
        "Complete and save the custom email configuration before testing.",
      );
    }

    delivery = {
      apiKey: decryptTenantCredential(
        settings.apiKeyEncrypted,
        organization.id,
        smtp2goCredentialPurpose,
      ),
      sender: settings.fromName
        ? `${settings.fromName} <${settings.fromEmail}>`
        : settings.fromEmail,
      replyToEmail: settings.replyToEmail,
    };
  } else {
    const effective = await resolveOrganizationEmailIntegration(organization.id);

    if (effective.status !== "CONFIGURED") {
      throw new EmailIntegrationConfigurationError(
        effective.status === "DISABLED"
          ? "Email delivery is disabled."
          : "No inherited email delivery is available.",
      );
    }

    delivery = effective;
  }

  try {
    await sendSmtp2goEmail({
      ...delivery,
      to: recipientEmail,
      subject: `${organization.name} email delivery test`,
      textBody: `Email delivery for ${organization.name} is working.`,
      htmlBody: `<p>Email delivery for <strong>${organization.name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</strong> is working.</p>`,
    });

    if (settings?.mode === "CUSTOM") {
      await getDb()
        .update(organizationEmailSettings)
        .set({
          verificationStatus: "VERIFIED",
          lastTestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizationEmailSettings.organizationId, organization.id));
    }
  } catch (error) {
    if (settings?.mode === "CUSTOM") {
      await getDb()
        .update(organizationEmailSettings)
        .set({ verificationStatus: "FAILED", updatedAt: new Date() })
        .where(eq(organizationEmailSettings.organizationId, organization.id));
    }

    throw error;
  }

  return getOrganizationEmailSettingsSnapshot(organization.id);
}
