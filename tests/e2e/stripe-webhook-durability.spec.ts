import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("Stripe webhook durability", () => {
  test("journals each endpoint event exactly once", () => {
    const schemaSource = source("db", "schema.ts");
    const migrationSource = source(
      "drizzle",
      "0057_stripe_webhook_events.sql",
    );
    const journalSource = source("lib", "stripe-webhook-events.ts");

    expect(schemaSource).toContain(
      'uniqueIndex("stripe_webhook_events_endpoint_event_unique")',
    );
    expect(migrationSource).toContain(
      '("endpoint", "event_id")',
    );
    expect(journalSource).toContain(".onConflictDoNothing");
    expect(journalSource).toContain('.for("update")');
  });

  test("guards completion with the claimed attempt and retries failures", () => {
    const journalSource = source("lib", "stripe-webhook-events.ts");

    expect(journalSource).toContain(
      "eq(stripeWebhookEvents.attemptCount, claim.attemptCount)",
    );
    expect(journalSource).toContain('status: "FAILED"');
    expect(journalSource).toContain('status: "SUCCEEDED"');
    expect(journalSource).toContain(
      "STRIPE_WEBHOOK_PROCESSING_TIMEOUT_MS",
    );
  });

  test("wraps platform and Connect event handlers", () => {
    for (const pathSegments of [
      ["app", "api", "stripe", "webhook", "route.ts"],
      ["app", "api", "stripe", "connect", "webhook", "route.ts"],
    ]) {
      const routeSource = source(...pathSegments);

      expect(routeSource).toContain("processStripeWebhookEvent(");
      expect(routeSource).toContain('result.state === "IN_PROGRESS"');
      expect(routeSource).toContain("status: 409");
      expect(routeSource).toContain("status: 500");
    }
  });

  test("alerts operations once without blocking Stripe retries", () => {
    const journalSource = source("lib", "stripe-webhook-events.ts");
    const alertSource = source("lib", "operational-alerts.ts");

    expect(journalSource).toContain("claim.attemptCount === 1");
    expect(journalSource).toContain("sendStripeWebhookFailureAlert");
    expect(journalSource).toContain("stripe.webhook.alert_failed");
    expect(alertSource).toContain("OPERATIONAL_ALERT_EMAIL");
    expect(alertSource).toContain("SMTP2GO_API_KEY");
    expect(alertSource).toContain("Stripe will retry this event");
  });
});
