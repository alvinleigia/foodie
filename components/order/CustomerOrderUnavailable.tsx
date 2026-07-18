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
                ordersHref: "/order/status",
                privacyHref: "/privacy",
              }
        }
      />
      <Card className="rounded-xl border-stone-200 bg-stone-100/95 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardContent className="px-8 py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">
            {isDisabledDomain ? "Domain disabled" : "Order link required"}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-stone-950">
            {isDisabledDomain
              ? "This ordering domain is disabled"
              : "Open the restaurant menu link"}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-stone-600">
            {isDisabledDomain
              ? "This domain is still pointing to Foodie, but tenant access has been disabled in platform domain settings. Enable it again or use an active QR/menu link."
              : "This ordering page needs a restaurant QR/menu link, a mapped customer domain, or signed-in restaurant access before it can show the menu."}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
