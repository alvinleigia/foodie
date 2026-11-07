import { notFound, redirect } from "next/navigation";

import { ReceiptPage } from "@/components/receipt/ReceiptPage";
import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getOrderReceipt } from "@/lib/order-receipts";
import { getGuestPaymentResult } from "@/lib/order-payments";
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
  const checkoutSessionId =
    typeof query.session_id === "string" ? query.session_id : undefined;
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
  const guestOrder = checkoutSessionId
    ? await getGuestPaymentResult(
        checkoutSessionId,
        publicContext.tenantContext,
      )
    : null;
  const isGuestReceipt = guestOrder?.orderId === orderId;
  const session = isGuestReceipt ? null : await requireCustomerSession();

  if (!isGuestReceipt && !session) {
    redirect(
      getCustomerLoginHref({
        ...customerContext,
        returnTo: receiptHref,
      }),
    );
  }

  const profile = session
    ? await getCustomerProfile(
        session.user.id,
        publicContext.tenantContext,
      )
    : null;

  if (!isGuestReceipt && !profile) {
    notFound();
  }

  const receipt = await getOrderReceipt(
    orderId,
    publicContext.tenantContext,
    profile?.id,
  );

  if (!receipt) {
    notFound();
  }

  return (
    <ReceiptPage
      autoPrint={query.print === "1"}
      backHref={withPublicCustomerContext("/order/status", customerContext)}
      receipt={receipt}
      tone="customer"
    />
  );
}
