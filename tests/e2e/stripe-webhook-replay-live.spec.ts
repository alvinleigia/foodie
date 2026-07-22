import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { getDb } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook-events";

import { optionalEnv } from "./helpers";

const databaseUrl = optionalEnv("E2E_DATABASE_URL");

test.describe("live Stripe webhook replay", () => {
  test.beforeAll(() => {
    if (databaseUrl) {
      process.env.DATABASE_URL = databaseUrl;
    }
  });

  test("serializes an active duplicate and ignores a completed replay", async () => {
    test.skip(
      !databaseUrl,
      "Set E2E_DATABASE_URL to a migrated UAT database to run webhook replay tests.",
    );

    const eventId = `evt_test_codex_parallel_${Date.now()}`;
    let releaseProcessing: () => void = () => undefined;
    let signalProcessingStarted: () => void = () => undefined;
    const processingStarted = new Promise<void>((resolve) => {
      signalProcessingStarted = resolve;
    });
    const processingGate = new Promise<void>((resolve) => {
      releaseProcessing = resolve;
    });
    let processCount = 0;

    try {
      const firstAttempt = processStripeWebhookEvent(
        {
          endpoint: "CONNECT",
          eventId,
          eventType: "checkout.session.completed",
          stripeAccountId: "acct_test_replay",
        },
        async () => {
          processCount += 1;
          signalProcessingStarted();
          await processingGate;
        },
      );

      await Promise.race([
        processingStarted,
        firstAttempt.then(
          () => {
            throw new Error("The first webhook attempt finished before entering its processing gate.");
          },
          (error: unknown) => {
            throw error;
          },
        ),
      ]);

      const concurrentAttempt = await processStripeWebhookEvent(
        {
          endpoint: "CONNECT",
          eventId,
          eventType: "checkout.session.completed",
          stripeAccountId: "acct_test_replay",
        },
        async () => {
          processCount += 1;
        },
      );

      expect(concurrentAttempt.state).toBe("IN_PROGRESS");
      releaseProcessing();
      await expect(firstAttempt).resolves.toEqual({ state: "PROCESSED" });

      const replay = await processStripeWebhookEvent(
        {
          endpoint: "CONNECT",
          eventId,
          eventType: "checkout.session.completed",
          stripeAccountId: "acct_test_replay",
        },
        async () => {
          processCount += 1;
        },
      );

      expect(replay.state).toBe("DUPLICATE");
      expect(processCount).toBe(1);
    } finally {
      releaseProcessing();
      await getDb()
        .delete(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, eventId));
    }
  });

  test("reclaims and completes a failed event", async () => {
    test.skip(
      !databaseUrl,
      "Set E2E_DATABASE_URL to a migrated UAT database to run webhook replay tests.",
    );

    const eventId = `evt_test_codex_retry_${Date.now()}`;
    let processCount = 0;

    try {
      await expect(
        processStripeWebhookEvent(
          {
            endpoint: "CONNECT",
            eventId,
            eventType: "refund.updated",
            stripeAccountId: "acct_test_replay",
          },
          async () => {
            processCount += 1;
            throw new Error("deliberate first-attempt failure");
          },
        ),
      ).rejects.toThrow("deliberate first-attempt failure");

      await expect(
        processStripeWebhookEvent(
          {
            endpoint: "CONNECT",
            eventId,
            eventType: "refund.updated",
            stripeAccountId: "acct_test_replay",
          },
          async () => {
            processCount += 1;
          },
        ),
      ).resolves.toEqual({ state: "PROCESSED" });

      expect(processCount).toBe(2);
    } finally {
      await getDb()
        .delete(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, eventId));
    }
  });
});
