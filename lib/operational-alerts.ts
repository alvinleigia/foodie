import "server-only";

import { logError, logEvent } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendSmtp2goEmail } from "@/lib/smtp2go";

const APPLICATION_ERROR_ALERT_WINDOW_MS = 15 * 60 * 1_000;
let fallbackApplicationErrorAlertResetAt = 0;

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

type UnhandledServerErrorAlert = {
  error: Error & { digest?: string };
  request: {
    method: string;
    path: string;
  };
  context: {
    routePath: string;
    routeType: string;
    routerKind: string;
  };
};

export class OperationalAlertConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationalAlertConfigurationError";
  }
}

function errorMessage(error: unknown, fallback = "Unknown error") {
  return (error instanceof Error ? error.message : fallback).slice(
    0,
    2_000,
  );
}

function safeRequestPath(path: string) {
  return path.split(/[?#]/, 1)[0]?.slice(0, 500) || "/";
}

function allowFallbackApplicationErrorAlert() {
  const now = Date.now();

  if (fallbackApplicationErrorAlertResetAt > now) {
    return false;
  }

  fallbackApplicationErrorAlertResetAt =
    now + APPLICATION_ERROR_ALERT_WINDOW_MS;
  return true;
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

export function getOperationalAlertStatus() {
  const { delivery, missingConfiguration } = resolveOperationalAlertDelivery();

  return {
    configured: Boolean(delivery),
    owner: process.env.OPERATIONAL_ALERT_EMAIL?.trim() || null,
    missingConfiguration,
    coverage: ["STRIPE_WEBHOOK_FAILURE", "UNHANDLED_SERVER_ERROR"] as const,
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

export async function reportUnhandledServerError(
  input: UnhandledServerErrorAlert,
) {
  const requestPath = safeRequestPath(input.request.path);
  const message = errorMessage(input.error);
  const digest = input.error.digest?.slice(0, 200) || null;
  const logFields = {
    method: input.request.method.slice(0, 20),
    requestPath,
    routePath: input.context.routePath.slice(0, 500),
    routeType: input.context.routeType.slice(0, 50),
    routerKind: input.context.routerKind.slice(0, 50),
    digest,
  };

  logError("application.unhandled_server_error", input.error, logFields);

  const { delivery, missingConfiguration } = resolveOperationalAlertDelivery();

  if (!delivery) {
    logEvent("warn", "application.error_alert_skipped", {
      ...logFields,
      missingConfiguration,
    });
    return { state: "SKIPPED" as const };
  }

  const fingerprint =
    digest ||
    `${input.context.routePath}:${input.error.name}:${message}`.slice(0, 1_000);
  let alertAllowed = false;

  try {
    const rateLimit = await checkRateLimit({
      key: `operational-alert:application-error:${fingerprint}`,
      limit: 1,
      windowMs: APPLICATION_ERROR_ALERT_WINDOW_MS,
    });
    alertAllowed = rateLimit.allowed;
  } catch (rateLimitError) {
    logError("application.error_alert_rate_limit_failed", rateLimitError, {
      ...logFields,
      fallback: "PROCESS_LOCAL",
    });
    alertAllowed = allowFallbackApplicationErrorAlert();
  }

  if (!alertAllowed) {
    logEvent("info", "application.error_alert_deduplicated", logFields);
    return { state: "DEDUPLICATED" as const };
  }

  const failedAt = new Date().toISOString();
  const cellId = process.env.DEPLOYMENT_CELL_ID?.trim() || "unknown";
  const deploymentSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown";
  const fields = [
    ["Error", `${input.error.name}: ${message}`],
    ["Digest", digest || "Not provided"],
    ["Method", logFields.method],
    ["Request path", requestPath],
    ["Route", logFields.routePath],
    ["Route type", logFields.routeType],
    ["Deployment cell", cellId],
    ["Deployment SHA", deploymentSha],
    ["Failed at", failedAt],
  ];

  await sendSmtp2goEmail({
    ...delivery,
    to: delivery.recipient,
    subject: `[Foodie] Unhandled server error in ${cellId}`,
    textBody: `${fields
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n")}\n\nReview the matching structured application log for further details.`,
    htmlBody: `<h1>Unhandled server error</h1><table>${fields
      .map(
        ([label, value]) =>
          `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
      )
      .join("")}</table><p>Review the matching structured application log for further details.</p>`,
  });

  logEvent("info", "application.error_alert_sent", logFields);

  return { state: "SENT" as const };
}
