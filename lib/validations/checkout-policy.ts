import { z } from "zod";

import {
  checkoutContactRequirements,
  checkoutPaymentTimings,
} from "@/lib/checkout-policy";
import { orderFulfilmentTypes } from "@/lib/order-fulfilment";

export const restaurantCheckoutPolicySchema = z
  .object({
    fulfilmentType: z.enum(orderFulfilmentTypes),
    isEnabled: z.boolean(),
    guestCheckoutEnabled: z.boolean(),
    accountCheckoutEnabled: z.boolean(),
    emailOtpLoginEnabled: z.boolean(),
    smsOtpLoginEnabled: z.boolean(),
    onlinePaymentEnabled: z.boolean(),
    payLaterEnabled: z.boolean(),
    defaultPaymentTiming: z.enum(checkoutPaymentTimings),
    contactRequirement: z.enum(checkoutContactRequirements),
  })
  .superRefine((policy, context) => {
    if (!policy.guestCheckoutEnabled && !policy.accountCheckoutEnabled) {
      context.addIssue({
        code: "custom",
        message: "Enable guest checkout or account checkout.",
        path: ["guestCheckoutEnabled"],
      });
    }

    if (policy.guestCheckoutEnabled && !policy.onlinePaymentEnabled) {
      context.addIssue({
        code: "custom",
        message: "Guest checkout requires online payment.",
        path: ["onlinePaymentEnabled"],
      });
    }

    if (!policy.onlinePaymentEnabled && !policy.payLaterEnabled) {
      context.addIssue({
        code: "custom",
        message: "Enable at least one payment option.",
        path: ["onlinePaymentEnabled"],
      });
    }

    if (
      (policy.defaultPaymentTiming === "ONLINE" &&
        !policy.onlinePaymentEnabled) ||
      (policy.defaultPaymentTiming === "PAY_LATER" &&
        !policy.payLaterEnabled)
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose an enabled default payment option.",
        path: ["defaultPaymentTiming"],
      });
    }
  });

export const restaurantCheckoutPoliciesSchema = z
  .object({
    policies: z.array(restaurantCheckoutPolicySchema).length(3),
  })
  .superRefine((value, context) => {
    const types = new Set(value.policies.map((policy) => policy.fulfilmentType));

    if (types.size !== orderFulfilmentTypes.length) {
      context.addIssue({
        code: "custom",
        message: "Configure each fulfilment type once.",
        path: ["policies"],
      });
    }
  });
