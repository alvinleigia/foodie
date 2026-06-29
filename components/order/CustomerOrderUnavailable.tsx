import { AppHeader } from "@/components/shared/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import type { MembershipRole } from "@/lib/staff-auth";

type CustomerOrderUnavailableProps = {
  user?: {
    name?: string | null;
    role: MembershipRole;
  } | null;
};

export function CustomerOrderUnavailable({ user }: CustomerOrderUnavailableProps) {
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
              }
        }
      />
      <Card className="rounded-xl border-stone-200 bg-stone-100/95 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardContent className="px-8 py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">
            Order link required
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-stone-950">
            Open the restaurant menu link
          </h1>
          <p className="mt-4 max-w-2xl text-base text-stone-600">
            This ordering page needs a restaurant QR/menu link, a mapped company
            domain, or signed-in location access before it can show the menu.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
