import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2Icon, Clock3Icon, XCircleIcon } from "lucide-react";

import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCustomerSession } from "@/lib/auth";
import {
  getCustomerOrderHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getCustomerPaymentResult } from "@/lib/order-payments";

export default async function OrderPaymentSuccessPage(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  },
) {
  const searchParams = await props.searchParams;
  const orderingPointQrSlug =
    typeof searchParams.qr === "string" ? searchParams.qr : undefined;
  const routeSlug =
    typeof searchParams.route === "string" ? searchParams.route : undefined;
  const customerContext = { orderingPointQrSlug, routeSlug };
  const accountHref = withPublicCustomerContext("/account", customerContext);
  const orderHref = getCustomerOrderHref("/order", customerContext);
  const ordersHref = getCustomerOrderHref("/order/status", customerContext);
  const session = await requireCustomerSession();

  if (!session) {
    redirect(orderHref);
  }

  const sessionId = searchParams.session_id;

  if (typeof sessionId !== "string") {
    redirect(accountHref);
  }

  const order = await getCustomerPaymentResult(session.user.id, sessionId);

  if (!order) {
    redirect(accountHref);
  }

  const isPaid = order.paymentStatus === "PAID";
  const hasFailed =
    order.paymentStatus === "FAILED" || order.paymentStatus === "CANCELLED";
  const Icon = isPaid ? CheckCircle2Icon : hasFailed ? XCircleIcon : Clock3Icon;

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-3xl space-y-6 pb-8">
      <AppHeader
        customerMenu={{
          accountHref,
          customerName: order.customerName,
          orderHref,
          ordersHref,
        }}
      />

      <Card className="rounded-xl border-white/60 bg-white/95">
        <CardContent className="grid justify-items-center gap-5 px-6 py-10 text-center">
          <span
            className={`grid size-14 place-items-center rounded-lg ${
              isPaid
                ? "bg-emerald-100 text-emerald-700"
                : hasFailed
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            <Icon className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase text-stone-500">
              Order #{order.orderNo}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950">
              {isPaid
                ? "Payment confirmed"
                : hasFailed
                  ? "Payment was not completed"
                  : "Confirming your payment"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-stone-600">
              {isPaid
                ? "Your order has been released to the restaurant team."
                : hasFailed
                  ? "The order was not sent for preparation."
                  : "Stripe is still confirming the payment. Refresh shortly or check your account."}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={ordersHref}>
                <ButtonLabel icon={Clock3Icon}>View your orders</ButtonLabel>
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={orderHref}>Back to menu</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
