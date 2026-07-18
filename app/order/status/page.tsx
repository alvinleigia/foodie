import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { CustomerOrderStatus } from "@/components/order/CustomerOrderStatus";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  getCustomerPrivacyHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";
import { resolveStaffHomePath } from "@/lib/staff-home";

type CustomerOrderStatusPageProps = {
  searchParams: PageProps<"/order/status">["searchParams"];
  routeSlug?: string;
};

export default async function CustomerOrderStatusPage(props: CustomerOrderStatusPageProps) {
  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const routeValue = searchParams.route;
  const orderingPointQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const routeSlug =
    props.routeSlug ?? (typeof routeValue === "string" ? routeValue : undefined);
  const { customer, hasTenantContext, unavailableReason, user } =
    await getPublicOrderRouteContext({ orderingPointQrSlug, routeSlug });
  const customerContext = { orderingPointQrSlug, routeSlug };
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);

  if (hasTenantContext && user) {
    const homePath = await resolveStaffHomePath(user);

    if (!homePath) {
      notFound();
    }

    redirect(homePath);
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
                privacyHref: getCustomerPrivacyHref(customerContext),
              }}
            />
          )}
          <CustomerOrderStatus
            orderingPointQrSlug={orderingPointQrSlug}
            routeSlug={routeSlug}
            refreshKey={0}
          />
        </>
      ) : (
        <CustomerOrderUnavailable reason={unavailableReason} user={user} />
      )}
    </AppShell>
  );
}
