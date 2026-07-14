import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { CustomerOrderStatus } from "@/components/order/CustomerOrderStatus";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

type CustomerOrderStatusPageProps = {
  searchParams: PageProps<"/order/status">["searchParams"];
  locationSlug?: string;
};

export default async function CustomerOrderStatusPage(props: CustomerOrderStatusPageProps) {
  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const locationValue = searchParams.location;
  const locationQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const locationSlug =
    props.locationSlug ?? (typeof locationValue === "string" ? locationValue : undefined);
  const { customer, hasTenantContext, unavailableReason, user } =
    await getPublicOrderRouteContext({ locationQrSlug, locationSlug });
  const customerContext = { locationQrSlug, locationSlug };

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      {hasTenantContext ? (
        <>
          {user ? (
            <AppHeader activePath="/order/status" user={user} />
          ) : (
            <AppHeader
              activePath="/order/status"
              customerMenu={{
                accountHref: customer ? "/account" : undefined,
                customerName: customer?.name,
                loginHref: customer
                  ? undefined
                  : getCustomerLoginHref({
                      ...customerContext,
                      returnTo: "/account",
                    }),
                orderHref: getCustomerOrderHref("/order", customerContext),
                ordersHref: getCustomerOrderHref("/order/status", customerContext),
              }}
            />
          )}
          <CustomerOrderStatus
            locationQrSlug={locationQrSlug}
            locationSlug={locationSlug}
            refreshKey={0}
          />
        </>
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
