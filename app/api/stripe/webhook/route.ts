import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  cancelPendingOrderPayment,
  markOrderPaymentPaid,
} from "@/lib/order-payments";
import { logError } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook-events";

async function handleStripeEvent(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    session.payment_status === "paid"
  ) {
    await markOrderPaymentPaid(session);
  }

  if (event.type === "checkout.session.expired") {
    await cancelPendingOrderPayment(session.id, "CANCELLED");
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await cancelPendingOrderPayment(session.id, "FAILED");
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookEvent(
      {
        endpoint: "PLATFORM",
        eventId: event.id,
        eventType: event.type,
        stripeAccountId: event.account ?? null,
      },
      () => handleStripeEvent(event),
    );

    if (result.state === "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Stripe webhook is already being processed." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      duplicate: result.state === "DUPLICATE",
      received: true,
    });
  } catch (error) {
    logError("stripe.webhook.processing_failed", error, {
      endpoint: "PLATFORM",
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json(
      { error: "Stripe webhook processing failed." },
      { status: 500 },
    );
  }
}
