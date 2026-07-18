import { redirect } from "next/navigation";

import { CustomerLoginForm } from "@/components/order/CustomerLoginForm";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  getCustomerOrderHref,
  getCustomerPrivacyHref,
  getSafeCustomerReturnTo,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

type CustomerLoginPageProps = {
  searchParams: Promise<{
    qr?: string | string[];
    route?: string | string[];
    returnTo?: string | string[];
  }>;
};

export default async function CustomerLoginPage({
  searchParams,
}: CustomerLoginPageProps) {
  const params = await searchParams;
  const orderingPointQrSlug = typeof params.qr === "string" ? params.qr : undefined;
  const routeSlug = typeof params.route === "string" ? params.route : undefined;
  const customerContext = { orderingPointQrSlug, routeSlug };
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);
  const returnTo = getSafeCustomerReturnTo(params.returnTo, ordersHref);
  const context = await getPublicOrderRouteContext({
    orderingPointQrSlug,
    routeSlug,
  });
  const orderHref = getCustomerOrderHref("/order", customerContext);

  if (context.customer) {
    redirect(returnTo);
  }

  if (context.user) {
    redirect(orderHref);
  }

  return (
    <AppShell
      topSpacing="compact"
      variant="dark"
      contentClassName="max-w-3xl space-y-6 pb-8"
    >
      {context.hasTenantContext ? (
        <>
          <AppHeader
            activePath="/customer/login"
            customerMenu={{
              orderHref,
              ordersHref: getCustomerOrderHref(
                "/order/status",
                customerContext,
              ),
              privacyHref: getCustomerPrivacyHref(customerContext),
            }}
          />
          <Card className="rounded-xl border-white/60 bg-white/95">
            <CardHeader className="px-6 pt-6">
              <SectionHeader
                eyebrow="Customer account"
                title="Sign in"
                description="Use a one-time email code or a connected account. No password is required."
                className="mb-0"
              />
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <CustomerLoginForm
                providers={context.customerAuthProviders}
                orderingPointQrSlug={orderingPointQrSlug}
                routeSlug={routeSlug}
                redirectTo={returnTo}
                title="Choose a sign-in method"
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <CustomerOrderUnavailable
          reason={context.unavailableReason}
          user={context.user}
        />
      )}
    </AppShell>
  );
}
