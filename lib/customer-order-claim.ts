import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { getCustomerProfile } from "@/lib/customer-account";
import { getGuestOrderClaimContactMatch } from "@/lib/guest-order-claim";
import type { TenantContext } from "@/lib/tenant-context";

export class CustomerOrderClaimError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CustomerOrderClaimError";
  }
}

type ClaimGuestOrderInput = {
  customerId: string;
  customerToken: string;
  orderId: string;
  tenantContext: TenantContext;
};

export async function claimGuestOrder({
  customerId,
  customerToken,
  orderId,
  tenantContext,
}: ClaimGuestOrderInput) {
  const customer = await getCustomerProfile(customerId, tenantContext);

  if (!customer) {
    throw new CustomerOrderClaimError("Customer profile not found.", 404);
  }

  return getDb().transaction(async (tx) => {
    const [order] = await tx
      .select({
        checkoutMode: orders.checkoutMode,
        customerEmail: orders.customerEmail,
        customerEmailVerifiedAt: orders.customerEmailVerifiedAt,
        customerId: orders.customerId,
        customerPhone: orders.customerPhone,
        customerPhoneVerifiedAt: orders.customerPhoneVerifiedAt,
        id: orders.id,
        organizationCustomerId: orders.organizationCustomerId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.organizationId, tenantContext.organizationId),
          eq(orders.customerToken, customerToken),
        ),
      )
      .limit(1)
      .for("update");

    if (!order || order.checkoutMode !== "GUEST") {
      throw new CustomerOrderClaimError("Guest order could not be found.", 404);
    }

    if (order.customerId || order.organizationCustomerId) {
      if (
        order.customerId === customer.customerId &&
        order.organizationCustomerId === customer.id
      ) {
        return { alreadyLinked: true, orderId: order.id };
      }

      throw new CustomerOrderClaimError(
        "This guest order is already linked to an account.",
        409,
      );
    }

    const { emailMatches, phoneMatches } = getGuestOrderClaimContactMatch(
      order,
      customer,
    );

    if (!emailMatches && !phoneMatches) {
      throw new CustomerOrderClaimError(
        "Sign in with the verified email or mobile used for this guest order.",
        403,
      );
    }

    const [claimedOrder] = await tx
      .update(orders)
      .set({
        customerEmailVerifiedAt: emailMatches
          ? customer.emailVerifiedAt
          : order.customerEmailVerifiedAt,
        customerId: customer.customerId,
        customerPhoneVerifiedAt: phoneMatches
          ? customer.phoneVerifiedAt
          : order.customerPhoneVerifiedAt,
        organizationCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.organizationId, tenantContext.organizationId),
          eq(orders.customerToken, customerToken),
          isNull(orders.customerId),
          isNull(orders.organizationCustomerId),
        ),
      )
      .returning({ id: orders.id });

    if (!claimedOrder) {
      throw new CustomerOrderClaimError(
        "This guest order changed while it was being linked. Try again.",
        409,
      );
    }

    return { alreadyLinked: false, orderId: claimedOrder.id };
  });
}
