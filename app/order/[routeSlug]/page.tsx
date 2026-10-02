import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { RestaurantWorkingHoursWatcher } from "@/components/order/RestaurantWorkingHoursWatcher";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function RestaurantOrderPage(
  props: PageProps<"/order/[routeSlug]">,
) {
  const params = await props.params;
  const {
    customer,
    customerAuthProviders,
    checkoutPolicies,
    customerCheckoutEnabled,
    customerOrderingEnabled,
    customerOrderingOpen,
    hasTenantContext,
    restaurantWorkingHours,
    stripePaymentsEnabled,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ routeSlug: params.routeSlug });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {!user && restaurantWorkingHours ? (
        <RestaurantWorkingHoursWatcher workingHours={restaurantWorkingHours} />
      ) : null}
      {hasTenantContext &&
      customerCheckoutEnabled &&
      customerOrderingEnabled &&
      customerOrderingOpen ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          checkoutPolicies={checkoutPolicies}
          routeSlug={params.routeSlug}
          stripePaymentsEnabled={stripePaymentsEnabled}
          user={user}
        />
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
