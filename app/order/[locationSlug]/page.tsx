import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { AppShell } from "@/components/shared/AppShell";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function LocationOrderPage(
  props: PageProps<"/order/[locationSlug]">,
) {
  const params = await props.params;
  const { hasTenantContext, user } = await getPublicOrderRouteContext({
    locationSlug: params.locationSlug,
  });

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext ? (
        <CustomerOrderPage locationSlug={params.locationSlug} user={user} />
      ) : (
        <CustomerOrderUnavailable user={user} />
      )}
    </AppShell>
  );
}
