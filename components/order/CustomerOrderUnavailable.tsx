import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicOrderUnavailableReason } from "@/lib/public-order-route-context";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderUnavailableProps = {
  reason?: PublicOrderUnavailableReason;
  user?: {
    name?: string | null;
    role: MembershipRole;
  } | null;
};

export function CustomerOrderUnavailable({
  reason = "MISSING_CONTEXT",
  user,
}: CustomerOrderUnavailableProps) {
  const isDisabledDomain = reason === "DOMAIN_DISABLED";
  const isOrderingDisabled = reason === "CUSTOMER_ORDERING_DISABLED";
  const areCustomerAccountsDisabled = reason === "CUSTOMER_ACCOUNTS_DISABLED";
  const eyebrow = isDisabledDomain
    ? "Domain disabled"
    : isOrderingDisabled
      ? "Online ordering unavailable"
      : areCustomerAccountsDisabled
        ? "Customer accounts unavailable"
      : "Order link required";
  const title = isDisabledDomain
    ? "This ordering domain is disabled"
    : isOrderingDisabled
      ? "Customer ordering is not available"
      : areCustomerAccountsDisabled
        ? "Customer sign-in is not available"
      : "Open the restaurant menu link";
  const description = isDisabledDomain
    ? "This domain is still pointing to Foodie, but tenant access has been disabled in platform domain settings. Enable it again or use an active QR/menu link."
    : isOrderingDisabled
      ? "This restaurant is not currently accepting customer orders online. Contact the restaurant for assistance."
      : areCustomerAccountsDisabled
        ? "Customer accounts, profiles and order history are not enabled for this restaurant. Contact the restaurant for assistance."
      : "This ordering page needs a restaurant QR/menu link, a mapped customer domain, or signed-in restaurant access before it can show the menu.";

  return (
    <>
      <AppHeader
        activePath="/order"
        user={user}
        customerMenu={
          user
            ? undefined
            : {
                orderHref: "/order",
                ordersHref: areCustomerAccountsDisabled
                  ? undefined
                  : "/order/status",
                privacyHref: "/privacy",
              }
        }
      />
      <Card className="rounded-xl border-stone-200 bg-stone-100/95 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardContent className="px-8 py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-stone-950">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-stone-600">
            {description}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
