import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import { sendSmtp2goEmail } from "@/lib/smtp2go";
import type { MembershipRole } from "@/lib/staff-auth";

export type StaffInvitationEmailDelivery =
  | {
      status: "SENT";
      recipientEmail: string;
    }
  | {
      status: "NOT_SENT";
      reason: "DELIVERY_FAILED" | "DISABLED" | "NOT_CONFIGURED";
      recipientEmail: string;
    };

const roleLabels: Record<MembershipRole, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  COMPANY_OWNER: "Company owner",
  COMPANY_MANAGER: "Company manager",
  RESTAURANT_MANAGER: "Restaurant manager",
  ORDER_OPERATOR: "Order operator",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendStaffInvitationEmail(input: {
  email: string;
  expiresAt: Date;
  inviteUrl: string;
  name: string;
  organizationId: string;
  role: MembershipRole;
}): Promise<StaffInvitationEmailDelivery> {
  const delivery = await resolveOrganizationEmailIntegration(input.organizationId);

  if (delivery.status !== "CONFIGURED") {
    return {
      status: "NOT_SENT",
      reason: delivery.status === "DISABLED" ? "DISABLED" : "NOT_CONFIGURED",
      recipientEmail: input.email,
    };
  }

  const [organization] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  const organizationName = organization?.name ?? "Foodie POS";
  const roleLabel = roleLabels[input.role];
  const expiresLabel = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(input.expiresAt);
  const safeName = escapeHtml(input.name);
  const safeOrganizationName = escapeHtml(organizationName);
  const safeRoleLabel = escapeHtml(roleLabel);
  const safeInviteUrl = escapeHtml(input.inviteUrl);

  try {
    await sendSmtp2goEmail({
      apiKey: delivery.apiKey,
      sender: delivery.sender,
      replyToEmail: delivery.replyToEmail,
      to: input.email,
      subject: `Your ${organizationName} staff invitation`,
      textBody: [
        `Hello ${input.name},`,
        "",
        `You have been invited to join ${organizationName} as ${roleLabel}.`,
        `Accept your invitation: ${input.inviteUrl}`,
        "",
        `This one-time link expires at ${expiresLabel} UTC.`,
        "If you were not expecting this invitation, you can ignore this email.",
      ].join("\n"),
      htmlBody: `
        <p>Hello ${safeName},</p>
        <p>You have been invited to join <strong>${safeOrganizationName}</strong> as ${safeRoleLabel}.</p>
        <p><a href="${safeInviteUrl}">Accept staff invitation</a></p>
        <p>This one-time link expires at ${escapeHtml(expiresLabel)} UTC.</p>
        <p>If you were not expecting this invitation, you can ignore this email.</p>
      `.trim(),
    });
  } catch {
    return {
      status: "NOT_SENT",
      reason: "DELIVERY_FAILED",
      recipientEmail: input.email,
    };
  }

  return { status: "SENT", recipientEmail: input.email };
}
