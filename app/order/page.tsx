import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { RestaurantPicker } from "@/components/order/RestaurantPicker";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function OrderPage(props: PageProps<"/order">) {
  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const routeValue = searchParams.route;
  const orderingPointQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const routeSlug = typeof routeValue === "string" ? routeValue : undefined;
  const {
    customer,
    customerAuthProviders,
    hasTenantContext,
    restaurantChoices,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ orderingPointQrSlug, routeSlug });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          orderingPointQrSlug={orderingPointQrSlug}
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
