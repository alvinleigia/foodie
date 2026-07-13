import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function OrderPage(props: PageProps<"/order">) {
  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const locationValue = searchParams.location;
  const locationQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const locationSlug = typeof locationValue === "string" ? locationValue : undefined;
  const {
    customer,
    customerAuthProviders,
    hasTenantContext,
    unavailableReason,
    user,
  } = await getPublicOrderRouteContext({ locationQrSlug, locationSlug });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext ? (
        <CustomerOrderPage
          customer={customer}
          customerAuthProviders={customerAuthProviders}
          locationQrSlug={locationQrSlug}
          locationSlug={locationSlug}
          user={user}
        />
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
