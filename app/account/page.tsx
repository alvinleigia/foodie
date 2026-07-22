import { redirect } from "next/navigation";

import { CustomerProfileForm } from "@/components/order/CustomerProfileForm";
import { CustomerOrderUnavailable } from "@/components/order/CustomerOrderUnavailable";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  getCustomerPrivacyHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";
import { getCustomerPhoneVerificationPolicy } from "@/lib/phone-verification-policy";

export default async function CustomerAccountPage(props: PageProps<"/account">) {
  const searchParams = await props.searchParams;
  const orderingPointQrSlug =
    typeof searchParams.qr === "string" ? searchParams.qr : undefined;
  const routeSlug =
    typeof searchParams.route === "string" ? searchParams.route : undefined;
  const customerContext = { orderingPointQrSlug, routeSlug };
  const routeContext = await getPublicOrderRouteContext(customerContext);

  if (routeContext.hasTenantContext && !routeContext.customerAccountsEnabled) {
    return (
      <AppShell
        topSpacing="compact"
        variant="dark"
        contentClassName="max-w-3xl space-y-6 pb-8"
      >
        <CustomerOrderUnavailable reason="CUSTOMER_ACCOUNTS_DISABLED" />
      </AppShell>
    );
  }

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
  const phoneVerificationPolicy = getCustomerPhoneVerificationPolicy();

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-3xl space-y-6 pb-8">
      <AppHeader
        activePath="/account"
        customerMenu={{
          accountHref,
          customerName: customer.name,
          orderHref: getCustomerOrderHref("/order", customerContext),
          ordersHref,
          privacyHref: getCustomerPrivacyHref(customerContext),
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
            customer={{
              dateOfBirth: customer.dateOfBirth,
              email: customer.email,
              gender: customer.gender,
              marketingOptIn: customer.marketingOptIn,
              name: customer.name,
              phone: customer.phone,
              phoneVerifiedAt: customer.phoneVerifiedAt?.toISOString() ?? null,
            }}
            orderingPointQrSlug={orderingPointQrSlug}
            phoneVerificationPolicy={phoneVerificationPolicy}
            routeSlug={routeSlug}
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
