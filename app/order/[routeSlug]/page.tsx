import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { RestaurantWorkingHoursWatcher } from "@/components/order/RestaurantWorkingHoursWatcher";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";
import { getCustomerRestaurantIdentity } from "@/lib/menu";
import { getRestaurantClosedMessage } from "@/lib/working-hours";

export default async function RestaurantOrderPage(
  props: PageProps<"/order/[routeSlug]">,
) {
  const params = await props.params;
  const {
    customer,
    customerAuthProviders,
    chargeSettings,
    checkoutPolicies,
    customerCheckoutEnabled,
    customerOrderingEnabled,
    customerOrderingOpen,
    hasTenantContext,
    restaurantWorkingHours,
    stripePaymentsEnabled,
    tenantContext,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ routeSlug: params.routeSlug });
  const restaurant = !user && tenantContext && customerOrderingEnabled
    ? await getCustomerRestaurantIdentity(tenantContext)
    : null;
  const closedMessage = !customerOrderingOpen && restaurantWorkingHours
    ? getRestaurantClosedMessage(restaurantWorkingHours)
    : null;

  return (
    <AppShell topSpacing="compact" variant={user ? "dark" : "customer"} contentClassName="max-w-6xl space-y-6 pb-8">
      {!user && restaurantWorkingHours ? (
        <RestaurantWorkingHoursWatcher workingHours={restaurantWorkingHours} orderingOpen={customerOrderingOpen} closedMessage={closedMessage} />
      ) : null}
      {hasTenantContext &&
      customerCheckoutEnabled &&
      customerOrderingEnabled ? (
        <CustomerOrderPage
          customerOrderingOpen={customerOrderingOpen}
          closedMessage={closedMessage}
          restaurant={restaurant}
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          chargeSettings={chargeSettings}
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
