import Stripe from "stripe";

let stripe: Stripe | undefined;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Stripe is not configured.");
  }

  if (!stripe) {
    stripe = new Stripe(secretKey);
  }

  return stripe;
}
