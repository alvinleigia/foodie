import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function RestaurantOrderPage(
  props: PageProps<"/order/[routeSlug]">,
) {
  const params = await props.params;
  const {
    customer,
    customerAuthProviders,
    hasTenantContext,
    phoneVerificationPolicy,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ routeSlug: params.routeSlug });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          phoneVerificationPolicy={phoneVerificationPolicy}
          routeSlug={params.routeSlug}
          user={user}
        />
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
