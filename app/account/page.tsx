import { redirect } from "next/navigation";
import { UserRoundIcon } from "lucide-react";

import { CustomerProfileForm } from "@/components/order/CustomerProfileForm";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireCustomerSession } from "@/lib/auth";
import {
  getCustomerOrderHistory,
  getCustomerProfile,
} from "@/lib/customer-account";
import {
  getCustomerLoginHref,
  getCustomerOrderHref,
  withPublicCustomerContext,
} from "@/lib/customer-navigation";
import { getPublicOrderRouteContext } from "@/lib/public-order-route-context";

function getOrderStatusTone(status: string) {
  if (status === "DELIVERED") {
    return "success" as const;
  }

  if (status === "CANCELLED") {
    return "danger" as const;
  }

  return "warning" as const;
}

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

  const [customer, orderHistory] = await Promise.all([
    getCustomerProfile(session.user.id, routeContext.tenantContext),
    getCustomerOrderHistory(session.user.id, routeContext.tenantContext),
  ]);

  if (!customer) {
    redirect(getCustomerOrderHref("/order", customerContext));
  }

  const accountHref = withPublicCustomerContext("/account", customerContext);
  const ordersHref = withPublicCustomerContext(
    "/account#orders",
    customerContext,
  );

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <AppHeader
        activePath="/account"
        customerMenu={{
          accountHref,
          customerName: customer.name,
          orderHref: getCustomerOrderHref("/order", customerContext),
          ordersHref,
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
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

        <section id="orders" className="min-w-0 scroll-mt-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <span className="grid size-10 place-items-center rounded-lg bg-white/10">
              <UserRoundIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Order history</h2>
              <p className="text-sm text-stone-400">Your latest account-linked orders</p>
            </div>
          </div>

          {orderHistory.length > 0 ? (
            <div className="grid gap-3">
              {orderHistory.map((order) => (
                <Card key={order.orderId} className="rounded-lg border-white/60 bg-white/95">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-950">Order #{order.orderNo}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {order.organizationName} - {order.locationName}
                        </p>
                      </div>
                      <StatusPill
                        tone={getOrderStatusTone(
                          order.paymentStatus === "PENDING"
                            ? "PENDING"
                            : order.status,
                        )}
                      >
                        {order.paymentStatus === "PENDING"
                          ? "PAYMENT PENDING"
                          : order.status}
                      </StatusPill>
                    </div>
                    <div className="mt-4 grid gap-2 border-t border-stone-200 pt-4">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <span className="text-stone-700">
                            {item.drinkName} x {item.quantity}
                          </span>
                          <span className="text-stone-500">{item.status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-stone-500">
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(order.createdAt))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="border-y border-white/10 py-8 text-sm text-stone-300">
              No account-linked orders yet.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
