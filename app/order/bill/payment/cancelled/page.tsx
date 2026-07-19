import { CreditCardIcon } from "lucide-react";

import { AppShell } from "@/components/shared/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export default function StaffBillPaymentCancelledPage() {
  return (
    <AppShell
      topSpacing="compact"
      variant="dark"
      contentClassName="max-w-2xl pb-8"
    >
      <Card className="rounded-lg border-white/60 bg-white/95">
        <CardContent className="grid justify-items-center gap-5 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-lg bg-stone-100 text-stone-700">
            <CreditCardIcon className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase text-stone-500">
              Payment not completed
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950">
              Your bill is still unpaid
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-stone-600">
              No payment was taken. Return to the restaurant team if you would
              like to try again or choose another payment method.
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
