"use client";

import type { CustomerAuthProviders } from "@/components/order/CustomerLoginForm";
import { MembershipSwitcher } from "@/components/admin/MembershipSwitcher";
import { OrderForm } from "@/components/order/OrderForm";
import { AppHeader } from "@/components/shared/AppHeader";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  getCustomerPrivacyHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getStaffRestaurantOrderHref } from "@/lib/staff-restaurant-navigation";
import { getStaffNavigationItemsForRestaurant } from "@/lib/staff-navigation";
import type { MembershipRole } from "@/lib/staff-auth";
import type { CustomerPhoneVerificationPolicy } from "@/lib/phone-verification-policy";

type CustomerOrderPageProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    phoneVerifiedAt?: string | null;
  } | null;
  customerAuthProviders: CustomerAuthProviders;
  orderingPointQrSlug?: string;
  inventoryEnabled?: boolean;
  phoneVerificationPolicy: CustomerPhoneVerificationPolicy;
  routeSlug?: string;
  stripePaymentsEnabled?: boolean;
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
  inventoryEnabled = true,
  phoneVerificationPolicy,
  routeSlug,
  stripePaymentsEnabled = true,
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
            navigationItems={
              staffRestaurant
                ? getStaffNavigationItemsForRestaurant(staffRestaurant.slug, {
                    inventoryEnabled,
                  })
                : undefined
            }
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
            privacyHref: getCustomerPrivacyHref(customerContext),
          }}
        />
      )}

      <OrderForm
        customer={customer}
        customerAuthProviders={customerAuthProviders}
        isStaffOrder={Boolean(user)}
        orderingPointQrSlug={orderingPointQrSlug}
        phoneVerificationPolicy={phoneVerificationPolicy}
        routeSlug={routeSlug}
        stripePaymentsEnabled={stripePaymentsEnabled}
        staffRestaurantSlug={staffRestaurant?.slug}
      />
    </>
  );
}
