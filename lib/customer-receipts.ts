import "server-only";

import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getOrderReceipt } from "@/lib/order-receipts";
import { getGuestPaymentResult } from "@/lib/order-payments";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

export async function getCustomerReceipt(
  orderId: string,
  query: Record<string, string | string[] | undefined>,
) {
  const orderingPointQrSlug = typeof query.qr === "string" ? query.qr : undefined;
  const routeSlug = typeof query.route === "string" ? query.route : undefined;
  const checkoutSessionId =
    typeof query.session_id === "string" ? query.session_id : undefined;
  const customerContext = { orderingPointQrSlug, routeSlug };
  const publicContext = await getPublicOrderRouteContext(customerContext);

  if (
    !publicContext.hasTenantContext ||
    !publicContext.customerAccountsEnabled ||
    !publicContext.tenantContext
  ) {
    return { status: "not-found" } as const;
  }

  const guestOrder = checkoutSessionId
    ? await getGuestPaymentResult(checkoutSessionId, publicContext.tenantContext)
    : null;
  const isGuestReceipt = guestOrder?.orderId === orderId;
  const session = isGuestReceipt ? null : await requireCustomerSession();

  if (!isGuestReceipt && !session) {
    return {
      status: "sign-in",
      loginHref: getCustomerLoginHref({
        ...customerContext,
        returnTo: withPublicCustomerContext(
          `/order/receipt/${encodeURIComponent(orderId)}`,
          customerContext,
        ),
      }),
    } as const;
  }

  const profile = session
    ? await getCustomerProfile(session.user.id, publicContext.tenantContext)
    : null;

  if (!isGuestReceipt && !profile) {
    return { status: "not-found" } as const;
  }

  const receipt = await getOrderReceipt(
    orderId,
    publicContext.tenantContext,
    profile?.id,
  );
  return receipt
    ? ({ status: "ok", receipt, customerContext } as const)
    : ({ status: "not-found" } as const);
}
