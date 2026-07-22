import "server-only";

import { logEvent } from "@/lib/logger";
import { sendSmtp2goEmail } from "@/lib/smtp2go";

type StripeWebhookFailureAlert = {
  endpoint: "PLATFORM" | "CONNECT";
  eventId: string;
  eventType: string;
  stripeAccountId: string | null;
  attemptCount: number;
  error: unknown;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown webhook error").slice(
    0,
    2_000,
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendStripeWebhookFailureAlert(
  input: StripeWebhookFailureAlert,
) {
  const apiKey = process.env.SMTP2GO_API_KEY?.trim();
  const sender = process.env.EMAIL_FROM?.trim();
  const recipient = process.env.OPERATIONAL_ALERT_EMAIL?.trim();

  if (!apiKey || !sender || !recipient) {
    logEvent("warn", "stripe.webhook.alert_skipped", {
      endpoint: input.endpoint,
      eventId: input.eventId,
      missingConfiguration: [
        !apiKey ? "SMTP2GO_API_KEY" : null,
        !sender ? "EMAIL_FROM" : null,
        !recipient ? "OPERATIONAL_ALERT_EMAIL" : null,
      ].filter(Boolean),
    });
    return { state: "SKIPPED" as const };
  }

  const failedAt = new Date().toISOString();
  const message = errorMessage(input.error);
  const cellId = process.env.DEPLOYMENT_CELL_ID?.trim() || "unknown";
  const deploymentSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown";
  const subject = `[Foodie] Stripe webhook failed in ${cellId}`;
  const fields = [
    ["Endpoint", input.endpoint],
    ["Event", input.eventType],
    ["Event ID", input.eventId],
    ["Stripe account", input.stripeAccountId || "Platform account"],
    ["Attempt", String(input.attemptCount)],
    ["Deployment cell", cellId],
    ["Deployment SHA", deploymentSha],
    ["Failed at", failedAt],
    ["Error", message],
  ];
  const textBody = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlBody = `<h1>Stripe webhook processing failed</h1><table>${fields
    .map(
      ([label, value]) =>
        `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table><p>Stripe will retry this event. Review the webhook journal and application logs before replaying it manually.</p>`;

  await sendSmtp2goEmail({
    apiKey,
    sender,
    to: recipient,
    subject,
    textBody,
    htmlBody,
  });

  logEvent("info", "stripe.webhook.alert_sent", {
    endpoint: input.endpoint,
    eventId: input.eventId,
  });

  return { state: "SENT" as const };
}
