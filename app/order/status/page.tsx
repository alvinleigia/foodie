import { redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { CustomerOrderStatus } from "@/components/order/CustomerOrderStatus";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  withPublicCustomerContext,
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
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);

  if (hasTenantContext && user) {
    redirect("/operations/orders");
  }

  if (hasTenantContext && !customer) {
    redirect(
      getCustomerLoginHref({
        ...customerContext,
        returnTo: ordersHref,
      }),
    );
  }

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
                orderHref: getCustomerOrderHref("/order", customerContext),
                ordersHref,
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
