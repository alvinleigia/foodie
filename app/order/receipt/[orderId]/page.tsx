import { notFound, redirect } from "next/navigation";

import { ReceiptPage } from "@/components/receipt/ReceiptPage";
import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getOrderReceipt } from "@/lib/order-receipts";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

type CustomerReceiptPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerReceiptPage({
  params,
  searchParams,
}: CustomerReceiptPageProps) {
  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const qrValue = query.qr;
  const routeValue = query.route;
  const orderingPointQrSlug = typeof qrValue === "string" ? qrValue : undefined;
  const routeSlug = typeof routeValue === "string" ? routeValue : undefined;
  const publicContext = await getPublicOrderRouteContext({
    orderingPointQrSlug,
    routeSlug,
  });

  if (
    !publicContext.hasTenantContext ||
    !publicContext.customerAccountsEnabled ||
    !publicContext.tenantContext
  ) {
    notFound();
  }

  const customerContext = { orderingPointQrSlug, routeSlug };
  const receiptHref = withPublicCustomerContext(
    `/order/receipt/${encodeURIComponent(orderId)}`,
    customerContext,
  );
  const session = await requireCustomerSession();

  if (!session) {
    redirect(
      getCustomerLoginHref({
        ...customerContext,
        returnTo: receiptHref,
      }),
    );
  }

  const profile = await getCustomerProfile(
    session.user.id,
    publicContext.tenantContext,
  );

  if (!profile) {
    notFound();
  }

  const receipt = await getOrderReceipt(
    orderId,
    publicContext.tenantContext,
    profile.id,
  );

  if (!receipt) {
    notFound();
  }

  return (
    <ReceiptPage
      backHref={withPublicCustomerContext("/order/status", customerContext)}
      receipt={receipt}
    />
  );
}
