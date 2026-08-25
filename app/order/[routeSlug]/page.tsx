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
    customerAccountsEnabled,
    customerAuthProviders,
    customerOrderingEnabled,
    customerOrderingOpen,
    hasTenantContext,
    phoneVerificationPolicy,
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
      customerOrderingEnabled &&
      customerAccountsEnabled &&
      customerOrderingOpen ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          phoneVerificationPolicy={phoneVerificationPolicy}
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
