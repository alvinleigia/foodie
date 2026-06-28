"use client";

import { OrderForm } from "@/components/order/OrderForm";
import { AppHeader } from "@/components/shared/AppHeader";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderPageProps = {
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

export function CustomerOrderPage({ locationQrSlug, locationSlug, user }: CustomerOrderPageProps) {
  return (
    <>
      {user ? (
        <AppHeader activePath="/order" user={user} />
      ) : (
        <AppHeader
          activePath="/order"
          customerMenu={{
            orderHref: getCustomerHref("/order", { locationQrSlug, locationSlug }),
            ordersHref: getCustomerHref("/order/status", { locationQrSlug, locationSlug }),
          }}
        />
      )}

      <OrderForm locationQrSlug={locationQrSlug} locationSlug={locationSlug} />
    </>
  );
}
