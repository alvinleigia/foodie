import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";
import { logError } from "@/lib/logger";
import { sendStripeWebhookFailureAlert } from "@/lib/operational-alerts";

export type StripeWebhookEndpoint = "PLATFORM" | "CONNECT";

type StripeWebhookEventInput = {
  endpoint: StripeWebhookEndpoint;
  eventId: string;
  eventType: string;
  stripeAccountId: string | null;
};

type StripeWebhookClaim = {
  attemptCount: number;
  id: string;
  state: "CLAIMED" | "DUPLICATE" | "IN_PROGRESS";
};

export type StripeWebhookProcessingResult = {
  state: "PROCESSED" | "DUPLICATE" | "IN_PROGRESS";
};

const STRIPE_WEBHOOK_PROCESSING_TIMEOUT_MS = 5 * 60_000;

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown webhook error").slice(
    0,
    2_000,
  );
}

async function claimStripeWebhookEvent(
  input: StripeWebhookEventInput,
): Promise<StripeWebhookClaim> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STRIPE_WEBHOOK_PROCESSING_TIMEOUT_MS,
  );

  return getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(stripeWebhookEvents)
      .values({
        endpoint: input.endpoint,
        eventId: input.eventId,
        eventType: input.eventType,
        stripeAccountId: input.stripeAccountId,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [stripeWebhookEvents.endpoint, stripeWebhookEvents.eventId],
      })
      .returning({
        attemptCount: stripeWebhookEvents.attemptCount,
        id: stripeWebhookEvents.id,
      });

    if (inserted) {
      return { ...inserted, state: "CLAIMED" };
    }

    const [existing] = await tx
      .select({
        attemptCount: stripeWebhookEvents.attemptCount,
        id: stripeWebhookEvents.id,
        processingStartedAt: stripeWebhookEvents.processingStartedAt,
        status: stripeWebhookEvents.status,
      })
      .from(stripeWebhookEvents)
      .where(
        and(
          eq(stripeWebhookEvents.endpoint, input.endpoint),
          eq(stripeWebhookEvents.eventId, input.eventId),
        ),
      )
      .limit(1)
      .for("update");

    if (!existing) {
      throw new Error("Stripe webhook event claim disappeared.");
    }

    if (existing.status === "SUCCEEDED") {
      return { ...existing, state: "DUPLICATE" };
    }

    if (
      existing.status === "PROCESSING" &&
      existing.processingStartedAt > staleBefore
    ) {
      return { ...existing, state: "IN_PROGRESS" };
    }

    const [claimed] = await tx
      .update(stripeWebhookEvents)
      .set({
        attemptCount: sql`${stripeWebhookEvents.attemptCount} + 1`,
        lastError: null,
        processedAt: null,
        processingStartedAt: now,
        status: "PROCESSING",
        stripeAccountId: input.stripeAccountId,
        updatedAt: now,
      })
      .where(eq(stripeWebhookEvents.id, existing.id))
      .returning({
        attemptCount: stripeWebhookEvents.attemptCount,
        id: stripeWebhookEvents.id,
      });

    if (!claimed) {
      throw new Error("Stripe webhook event could not be reclaimed.");
    }

    return { ...claimed, state: "CLAIMED" };
  });
}

async function completeStripeWebhookEvent(claim: StripeWebhookClaim) {
  const [completed] = await getDb()
    .update(stripeWebhookEvents)
    .set({
      lastError: null,
      processedAt: new Date(),
      status: "SUCCEEDED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, claim.id),
        eq(stripeWebhookEvents.status, "PROCESSING"),
        eq(stripeWebhookEvents.attemptCount, claim.attemptCount),
      ),
    )
    .returning({ id: stripeWebhookEvents.id });

  if (!completed) {
    throw new Error("Stripe webhook event claim expired before completion.");
  }
}

async function failStripeWebhookEvent(
  claim: StripeWebhookClaim,
  error: unknown,
) {
  await getDb()
    .update(stripeWebhookEvents)
    .set({
      lastError: errorMessage(error),
      processedAt: new Date(),
      status: "FAILED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, claim.id),
        eq(stripeWebhookEvents.status, "PROCESSING"),
        eq(stripeWebhookEvents.attemptCount, claim.attemptCount),
      ),
    );
}

export async function processStripeWebhookEvent(
  input: StripeWebhookEventInput,
  processEvent: () => Promise<void>,
): Promise<StripeWebhookProcessingResult> {
  const claim = await claimStripeWebhookEvent(input);

  if (claim.state === "DUPLICATE" || claim.state === "IN_PROGRESS") {
    return { state: claim.state };
  }

  try {
    await processEvent();
    await completeStripeWebhookEvent(claim);
    return { state: "PROCESSED" };
  } catch (error) {
    await failStripeWebhookEvent(claim, error).catch((journalError) => {
      logError("stripe.webhook.journal_failure", journalError, {
        endpoint: input.endpoint,
        eventId: input.eventId,
      });
    });

    if (claim.attemptCount === 1) {
      await sendStripeWebhookFailureAlert({
        ...input,
        attemptCount: claim.attemptCount,
        error,
      }).catch((alertError) => {
        logError("stripe.webhook.alert_failed", alertError, {
          endpoint: input.endpoint,
          eventId: input.eventId,
        });
      });
    }

    throw error;
  }
}
