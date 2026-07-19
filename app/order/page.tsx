import { redirect } from "next/navigation";

import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { RestaurantPicker } from "@/components/order/RestaurantPicker";
import { AppShell } from "@/components/shared/AppShell";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";
import { getStaffRestaurantOrderHref } from "@/lib/staff-restaurant-navigation";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";

export default async function OrderPage(props: PageProps<"/order">) {
  if (await isCurrentRequestPlatformAdministrationDomain()) {
    const staffAccess = await getCurrentStaffRestaurantAccess().catch(() => null);

    if (staffAccess) {
      redirect(getStaffRestaurantOrderHref(staffAccess.restaurant.slug));
    }
  }

  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const routeValue = searchParams.route;
  const orderingPointQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const routeSlug = typeof routeValue === "string" ? routeValue : undefined;
  const {
    customer,
    customerAuthProviders,
    customerOrderingEnabled,
    hasTenantContext,
    phoneVerificationPolicy,
    restaurantChoices,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ orderingPointQrSlug, routeSlug });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext && customerOrderingEnabled ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          orderingPointQrSlug={orderingPointQrSlug}
          phoneVerificationPolicy={phoneVerificationPolicy}
          routeSlug={routeSlug}
          user={user}
        />
      ) : restaurantChoices.length ? (
        <RestaurantPicker restaurants={restaurantChoices} />
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
