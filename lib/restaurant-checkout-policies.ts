import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { restaurantCheckoutPolicies } from "@/db/schema";
import {
  getDefaultCheckoutPolicy,
  type RestaurantCheckoutPolicy,
} from "@/lib/checkout-policy";
import { orderFulfilmentTypes } from "@/lib/order-fulfilment";
import { restaurantCheckoutPoliciesSchema } from "@/lib/validations/checkout-policy";

function serializePolicy(
  policy: typeof restaurantCheckoutPolicies.$inferSelect,
): RestaurantCheckoutPolicy {
  return {
    fulfilmentType: policy.fulfilmentType,
    isEnabled: policy.isEnabled,
    guestCheckoutEnabled: policy.guestCheckoutEnabled,
    accountCheckoutEnabled: policy.accountCheckoutEnabled,
    emailOtpLoginEnabled: policy.emailOtpLoginEnabled,
    smsOtpLoginEnabled: policy.smsOtpLoginEnabled,
    onlinePaymentEnabled: policy.onlinePaymentEnabled,
    payLaterEnabled: policy.payLaterEnabled,
    defaultPaymentTiming: policy.defaultPaymentTiming,
    contactRequirement: policy.contactRequirement,
  };
}

export async function getRestaurantCheckoutPolicies(organizationId: string) {
  const rows = await getDb()
    .select()
    .from(restaurantCheckoutPolicies)
    .where(eq(restaurantCheckoutPolicies.organizationId, organizationId));
  const rowsByType = new Map(
    rows.map((policy) => [policy.fulfilmentType, serializePolicy(policy)]),
  );

  return orderFulfilmentTypes.map(
    (fulfilmentType) =>
      rowsByType.get(fulfilmentType) ?? getDefaultCheckoutPolicy(fulfilmentType),
  );
}

export async function updateRestaurantCheckoutPolicies(
  organizationId: string,
  input: unknown,
) {
  const { policies } = restaurantCheckoutPoliciesSchema.parse(input);
  const now = new Date();

  await getDb().transaction(async (tx) => {
    for (const policy of policies) {
      await tx
        .insert(restaurantCheckoutPolicies)
        .values({
          organizationId,
          ...policy,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            restaurantCheckoutPolicies.organizationId,
            restaurantCheckoutPolicies.fulfilmentType,
          ],
          set: {
            isEnabled: policy.isEnabled,
            guestCheckoutEnabled: policy.guestCheckoutEnabled,
            accountCheckoutEnabled: policy.accountCheckoutEnabled,
            emailOtpLoginEnabled: policy.emailOtpLoginEnabled,
            smsOtpLoginEnabled: policy.smsOtpLoginEnabled,
            onlinePaymentEnabled: policy.onlinePaymentEnabled,
            payLaterEnabled: policy.payLaterEnabled,
            defaultPaymentTiming: policy.defaultPaymentTiming,
            contactRequirement: policy.contactRequirement,
            updatedAt: now,
          },
        });
    }
  });

  return getRestaurantCheckoutPolicies(organizationId);
}
