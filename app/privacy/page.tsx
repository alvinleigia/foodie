import { PrivacyNotice } from "@/components/legal/PrivacyNotice";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  getCustomerPrivacyHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import {
  getPrivacyNoticeConfiguration,
  getPrivacyNoticeTenantIdentity,
} from "@/lib/privacy-notice";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

type PrivacyPageProps = {
  searchParams: Promise<{
    qr?: string | string[];
    route?: string | string[];
  }>;
};

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const params = await searchParams;
  const orderingPointQrSlug =
    typeof params.qr === "string" ? params.qr : undefined;
  const routeSlug = typeof params.route === "string" ? params.route : undefined;
  const customerContext = { orderingPointQrSlug, routeSlug };
  const context = await getPublicOrderRouteContext(customerContext);
  const identity =
    context.hasTenantContext && context.tenantContext
      ? await getPrivacyNoticeTenantIdentity(context.tenantContext).catch(() => null)
      : null;
  const notice = getPrivacyNoticeConfiguration(identity);
  const orderHref = getCustomerOrderHref("/order", customerContext);
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);
  const privacyHref = getCustomerPrivacyHref(customerContext);

  return (
    <AppShell
      topSpacing="compact"
      variant="dark"
      contentClassName="max-w-4xl space-y-6 pb-8"
    >
      <AppHeader
        activePath="/privacy"
        brandHref={context.hasTenantContext ? orderHref : "/"}
        customerMenu={{
          accountHref: context.customer
            ? withPublicCustomerContext("/account", customerContext)
            : undefined,
          customerName: context.customer?.name,
          loginHref:
            context.hasTenantContext && !context.customer
              ? getCustomerLoginHref({
                  ...customerContext,
                  returnTo: orderHref,
                })
              : undefined,
          orderHref,
          ordersHref,
          privacyHref,
        }}
      />
      <PrivacyNotice notice={notice} />
    </AppShell>
  );
}
