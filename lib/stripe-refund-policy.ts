import type Stripe from "stripe";

export function getStripeApplicationFeeRefundParams(
  applicationFeeAmount: number | null | undefined,
): Pick<Stripe.RefundCreateParams, "refund_application_fee"> {
  return (applicationFeeAmount ?? 0) > 0
    ? { refund_application_fee: true }
    : {};
}
