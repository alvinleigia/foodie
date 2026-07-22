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

type OperationalAlertDelivery = {
  apiKey: string;
  recipient: string;
  sender: string;
};

export class OperationalAlertConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationalAlertConfigurationError";
  }
}

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

function resolveOperationalAlertDelivery() {
  const apiKey = process.env.SMTP2GO_API_KEY?.trim();
  const sender = process.env.EMAIL_FROM?.trim();
  const recipient = process.env.OPERATIONAL_ALERT_EMAIL?.trim();
  const missingConfiguration = [
    !apiKey ? "SMTP2GO_API_KEY" : null,
    !sender ? "EMAIL_FROM" : null,
    !recipient ? "OPERATIONAL_ALERT_EMAIL" : null,
  ].filter((value): value is string => Boolean(value));

  if (!apiKey || !sender || !recipient) {
    return { delivery: null, missingConfiguration };
  }

  return {
    delivery: { apiKey, sender, recipient } satisfies OperationalAlertDelivery,
    missingConfiguration,
  };
}

export async function sendOperationalAlertTest() {
  const { delivery, missingConfiguration } = resolveOperationalAlertDelivery();

  if (!delivery) {
    throw new OperationalAlertConfigurationError(
      `Operational alerts are missing: ${missingConfiguration.join(", ")}.`,
    );
  }

  const cellId = process.env.DEPLOYMENT_CELL_ID?.trim() || "unknown";
  const deploymentSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown";

  await sendSmtp2goEmail({
    ...delivery,
    to: delivery.recipient,
    subject: `[Foodie] Operational alert test from ${cellId}`,
    textBody: `Operational alert delivery is working.\nDeployment cell: ${cellId}\nDeployment SHA: ${deploymentSha}`,
    htmlBody: `<h1>Operational alert delivery is working</h1><p>Deployment cell: ${escapeHtml(cellId)}</p><p>Deployment SHA: ${escapeHtml(deploymentSha)}</p>`,
  });

  logEvent("info", "operational_alert.test_sent", { cellId });
}

export async function sendStripeWebhookFailureAlert(
  input: StripeWebhookFailureAlert,
) {
  const { delivery, missingConfiguration } = resolveOperationalAlertDelivery();

  if (!delivery) {
    logEvent("warn", "stripe.webhook.alert_skipped", {
      endpoint: input.endpoint,
      eventId: input.eventId,
      missingConfiguration,
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
    ...delivery,
    to: delivery.recipient,
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
