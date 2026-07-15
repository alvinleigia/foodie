"use client";

import type { CustomerAuthProviders } from "@/components/order/CustomerLoginForm";
import { OrderForm } from "@/components/order/OrderForm";
import { AppHeader } from "@/components/shared/AppHeader";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderPageProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  customerAuthProviders: CustomerAuthProviders;
  locationQrSlug?: string;
  locationSlug?: string;
  user?: {
    name?: string | null;
    role: MembershipRole;
  } | null;
};

export function CustomerOrderPage({
  customer,
  customerAuthProviders,
  locationQrSlug,
  locationSlug,
  user,
}: CustomerOrderPageProps) {
  const customerContext = { locationQrSlug, locationSlug };
  const orderHref = getCustomerOrderHref("/order", customerContext);
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);

  return (
    <>
      {user ? (
        <AppHeader activePath="/order" user={user} />
      ) : (
        <AppHeader
          activePath="/order"
          customerMenu={{
            accountHref: customer
              ? withPublicCustomerContext("/account", customerContext)
              : undefined,
            customerName: customer?.name,
            loginHref: customer
              ? undefined
              : getCustomerLoginHref({
                  ...customerContext,
                  returnTo: ordersHref,
                }),
            orderHref,
            ordersHref,
          }}
        />
      )}

      <OrderForm
        customer={customer}
        customerAuthProviders={customerAuthProviders}
        isStaffOrder={Boolean(user)}
        locationQrSlug={locationQrSlug}
        locationSlug={locationSlug}
      />
    </>
  );
}
