import { CheckCircle2Icon } from "lucide-react";

import { AppShell } from "@/components/shared/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export default function StaffBillPaymentSuccessPage() {
  return (
    <AppShell
      topSpacing="compact"
      variant="dark"
      contentClassName="max-w-2xl pb-8"
    >
      <Card className="rounded-lg border-white/60 bg-white/95">
        <CardContent className="grid justify-items-center gap-5 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
            <CheckCircle2Icon className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase text-stone-500">
              Payment submitted
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950">
              Thank you
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-stone-600">
              The restaurant will confirm the payment against your bill. You can
              close this page.
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
