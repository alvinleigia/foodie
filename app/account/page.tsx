import { redirect } from "next/navigation";

import { CustomerProfileForm } from "@/components/order/CustomerProfileForm";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export default async function CustomerAccountPage(props: PageProps<"/account">) {
  const searchParams = await props.searchParams;
  const locationQrSlug =
    typeof searchParams.qr === "string" ? searchParams.qr : undefined;
  const locationSlug =
    typeof searchParams.location === "string" ? searchParams.location : undefined;
  const customerContext = { locationQrSlug, locationSlug };
  const routeContext = await getPublicOrderRouteContext(customerContext);
  const session = await requireCustomerSession();

  if (!session) {
    redirect(
      getCustomerLoginHref({
        ...customerContext,
        returnTo: "/account",
      }),
    );
  }

  if (!routeContext.hasTenantContext || !routeContext.tenantContext) {
    redirect(getCustomerOrderHref("/order", customerContext));
  }

  const customer = await getCustomerProfile(
    session.user.id,
    routeContext.tenantContext,
  );

  if (!customer) {
    redirect(getCustomerOrderHref("/order", customerContext));
  }

  const accountHref = withPublicCustomerContext("/account", customerContext);
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-3xl space-y-6 pb-8">
      <AppHeader
        activePath="/account"
        customerMenu={{
          accountHref,
          customerName: customer.name,
          orderHref: getCustomerOrderHref("/order", customerContext),
          ordersHref,
        }}
      />

      <Card className="rounded-xl border-white/60 bg-white/95">
        <CardHeader className="px-6 pt-6">
          <SectionHeader
            eyebrow="Account"
            title="Your profile"
            meta={<p className="text-sm text-stone-600">Keep your contact details current for order fulfilment.</p>}
            className="mb-0"
          />
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <CustomerProfileForm
            customer={customer}
            locationQrSlug={locationQrSlug}
            locationSlug={locationSlug}
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
