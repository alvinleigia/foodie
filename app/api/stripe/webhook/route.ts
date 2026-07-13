import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  cancelPendingOrderPayment,
  markOrderPaymentPaid,
} from "@/lib/order-payments";
import { getStripe } from "@/lib/stripe";

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

  return NextResponse.json({ received: true });
}
