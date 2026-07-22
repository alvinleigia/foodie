import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  cancelPendingOrderPayment,
  markOrderPaymentPaid,
} from "@/lib/order-payments";
import { syncOrderRefundFromStripe } from "@/lib/order-cancellation";
import { syncStripeAccountFromWebhook } from "@/lib/organization-payment-settings";
import { logError } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook-events";

async function handleStripeConnectEvent(event: Stripe.Event) {
  if (event.type === "account.updated") {
    await syncStripeAccountFromWebhook(event.data.object as Stripe.Account);
    return;
  }

  const stripeConnectedAccountId = event.account ?? null;

  if (!stripeConnectedAccountId) {
    return;
  }

  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    await syncOrderRefundFromStripe(
      event.data.object as Stripe.Refund,
      stripeConnectedAccountId,
    );
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    session.payment_status === "paid"
  ) {
    await markOrderPaymentPaid(session, stripeConnectedAccountId);
  }

  if (event.type === "checkout.session.expired") {
    await cancelPendingOrderPayment(
      session.id,
      "CANCELLED",
      stripeConnectedAccountId,
    );
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await cancelPendingOrderPayment(
      session.id,
      "FAILED",
      stripeConnectedAccountId,
    );
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe Connect webhook is not configured." },
      { status: 400 },
    );
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
        endpoint: "CONNECT",
        eventId: event.id,
        eventType: event.type,
        stripeAccountId: event.account ?? null,
      },
      () => handleStripeConnectEvent(event),
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
      endpoint: "CONNECT",
      eventId: event.id,
      eventType: event.type,
      stripeAccountId: event.account ?? null,
    });
    return NextResponse.json(
      { error: "Stripe webhook processing failed." },
      { status: 500 },
    );
  }
}
