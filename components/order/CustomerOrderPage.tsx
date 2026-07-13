"use client";

import { OrderForm } from "@/components/order/OrderForm";
import { AppHeader } from "@/components/shared/AppHeader";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderPageProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  customerAuthProviders: {
    apple: boolean;
    facebook: boolean;
    google: boolean;
  };
  locationQrSlug?: string;
  locationSlug?: string;
  user?: {
    name?: string | null;
    role: MembershipRole;
  } | null;
};

function getCustomerHref(path: "/order" | "/order/status", options: {
  locationQrSlug?: string;
  locationSlug?: string;
}) {
  if (options.locationSlug) {
    return `${path}/${encodeURIComponent(options.locationSlug)}`;
  }

  if (options.locationQrSlug) {
    return `${path}?qr=${encodeURIComponent(options.locationQrSlug)}`;
  }

  return path;
}

export function CustomerOrderPage({
  customer,
  customerAuthProviders,
  locationQrSlug,
  locationSlug,
  user,
}: CustomerOrderPageProps) {
  return (
    <>
      {user ? (
        <AppHeader activePath="/order" user={user} />
      ) : (
        <AppHeader
          activePath="/order"
          customerMenu={{
            accountHref: customer ? "/account" : undefined,
            customerName: customer?.name,
            orderHref: getCustomerHref("/order", { locationQrSlug, locationSlug }),
            ordersHref: getCustomerHref("/order/status", { locationQrSlug, locationSlug }),
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
