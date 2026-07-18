import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  cancelPendingOrderPayment,
  markOrderPaymentPaid,
} from "@/lib/order-payments";
import { syncOrderRefundFromStripe } from "@/lib/order-cancellation";
import { syncStripeAccountFromWebhook } from "@/lib/organization-payment-settings";
import { getStripe } from "@/lib/stripe";

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

  if (event.type === "account.updated") {
    await syncStripeAccountFromWebhook(event.data.object as Stripe.Account);
    return NextResponse.json({ received: true });
  }

  const stripeConnectedAccountId = event.account ?? null;

  if (!stripeConnectedAccountId) {
    return NextResponse.json({ received: true });
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
    return NextResponse.json({ received: true });
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

  return NextResponse.json({ received: true });
}
