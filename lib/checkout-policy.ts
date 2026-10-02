import type { OrderFulfilmentType } from "@/lib/order-fulfilment";

export const checkoutContactRequirements = [
  "EMAIL",
  "PHONE",
  "EMAIL_OR_PHONE",
  "EMAIL_AND_PHONE",
] as const;

export type CheckoutContactRequirement =
  (typeof checkoutContactRequirements)[number];

export const checkoutPaymentTimings = ["ONLINE", "PAY_LATER"] as const;

export type CheckoutPaymentTiming = (typeof checkoutPaymentTimings)[number];

export type RestaurantCheckoutPolicy = {
  fulfilmentType: OrderFulfilmentType;
  isEnabled: boolean;
  guestCheckoutEnabled: boolean;
  accountCheckoutEnabled: boolean;
  emailOtpLoginEnabled: boolean;
  smsOtpLoginEnabled: boolean;
  onlinePaymentEnabled: boolean;
  payLaterEnabled: boolean;
  defaultPaymentTiming: CheckoutPaymentTiming;
  contactRequirement: CheckoutContactRequirement;
};

export function getDefaultCheckoutPolicy(
  fulfilmentType: OrderFulfilmentType,
): RestaurantCheckoutPolicy {
  return {
    fulfilmentType,
    isEnabled: true,
    guestCheckoutEnabled: true,
    accountCheckoutEnabled: true,
    emailOtpLoginEnabled: true,
    smsOtpLoginEnabled: true,
    onlinePaymentEnabled: true,
    payLaterEnabled: true,
    defaultPaymentTiming: "ONLINE",
    contactRequirement:
      fulfilmentType === "DELIVERY" ? "EMAIL_AND_PHONE" : "EMAIL_OR_PHONE",
  };
}

export const checkoutContactRequirementLabels: Record<
  CheckoutContactRequirement,
  string
> = {
  EMAIL: "Email required",
  PHONE: "Mobile required",
  EMAIL_OR_PHONE: "Email or mobile required",
  EMAIL_AND_PHONE: "Email and mobile required",
};

export function getPayLaterLabel(fulfilmentType: OrderFulfilmentType) {
  switch (fulfilmentType) {
    case "DINE_IN":
      return "Pay at restaurant";
    case "PICKUP":
      return "Pay at collection";
    case "DELIVERY":
      return "Cash on delivery";
  }
}

export function isCheckoutContactValid(
  requirement: CheckoutContactRequirement,
  contact: { email?: string | null; phone?: string | null },
) {
  const hasEmail = Boolean(contact.email?.trim());
  const hasPhone = Boolean(contact.phone?.trim());

  switch (requirement) {
    case "EMAIL":
      return hasEmail;
    case "PHONE":
      return hasPhone;
    case "EMAIL_OR_PHONE":
      return hasEmail || hasPhone;
    case "EMAIL_AND_PHONE":
      return hasEmail && hasPhone;
  }
}
