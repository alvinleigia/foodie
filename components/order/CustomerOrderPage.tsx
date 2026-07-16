"use client";

import type { CustomerAuthProviders } from "@/components/order/CustomerLoginForm";
import { MembershipSwitcher } from "@/components/admin/MembershipSwitcher";
import { OrderForm } from "@/components/order/OrderForm";
import { AppHeader } from "@/components/shared/AppHeader";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getStaffRestaurantOrderHref } from "@/lib/staff-restaurant-navigation";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderPageProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  customerAuthProviders: CustomerAuthProviders;
  orderingPointQrSlug?: string;
  routeSlug?: string;
  staffRestaurant?: {
    id: string;
    name: string;
    slug: string;
  };
  user?: {
    name?: string | null;
    role: MembershipRole;
  } | null;
};

export function CustomerOrderPage({
  customer,
  customerAuthProviders,
  orderingPointQrSlug,
  routeSlug,
  staffRestaurant,
  user,
}: CustomerOrderPageProps) {
  const customerContext = { orderingPointQrSlug, routeSlug };
  const staffOrderHref = staffRestaurant
    ? getStaffRestaurantOrderHref(staffRestaurant.slug)
    : undefined;
  const orderHref = staffOrderHref ?? getCustomerOrderHref("/order", customerContext);
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);

  return (
    <>
      {user ? (
        <>
          <AppHeader
            activePath={staffOrderHref ?? "/order"}
            staffOrderHref={staffOrderHref}
            user={{ ...user, contextName: staffRestaurant?.name }}
          />
          {staffRestaurant ? (
            <div className="flex justify-end">
              <MembershipSwitcher
                currentOrganizationId={staffRestaurant.id}
                currentRole={user.role}
                redirectAfterSwitch="/order"
              />
            </div>
          ) : null}
        </>
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
        orderingPointQrSlug={orderingPointQrSlug}
        routeSlug={routeSlug}
        staffRestaurantSlug={staffRestaurant?.slug}
      />
    </>
  );
}
