"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";

type OpenCashDrawerSession = {
  currency: string;
  id: string;
  openedAtLabel: string;
  openingFloat: string;
  orderingPointId: string;
  orderingPointName: string;
  status: "OPEN";
};

type CashDrawerPanelProps = {
  currency: string;
  initialSession: OpenCashDrawerSession | null;
  orderingPoint: { id: string; name: string } | null;
  timezone: string;
};

type OpenSessionResponse = {
  session: Omit<OpenCashDrawerSession, "openedAtLabel"> & { openedAt: string };
};

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency,
    style: "currency",
  }).format(Number(amount));
}

function formatOpenedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function CashDrawerPanel({
  currency,
  initialSession,
  orderingPoint,
  timezone,
}: CashDrawerPanelProps) {
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(initialSession);

  if (!orderingPoint) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Ordering point required</CardTitle>
          <CardDescription>
            Configure an active ordering point before opening a cash drawer.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeOrderingPoint = orderingPoint;

  async function openDrawer() {
    setIsSubmitting(true);

    try {
      const payload = await requestJson<OpenSessionResponse>(
        "/api/cash-drawer/sessions",
        {
          body: {
            openingFloat,
            orderingPointId: activeOrderingPoint.id,
          },
          fallbackError: "Cash drawer could not be opened.",
        },
      );

      setSession({
        ...payload.session,
        openedAtLabel: formatOpenedAt(payload.session.openedAt, timezone),
        status: "OPEN",
      });
      toast.success("Cash drawer opened.");
    } catch (error) {
      toast.error(
        getCaughtErrorMessage(error, "Cash drawer could not be opened."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (session) {
    return (
      <Card className="max-w-2xl border-emerald-200 bg-emerald-50/70">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>Drawer open</CardTitle>
              <CardDescription>
                Cash payments can be collected at {session.orderingPointName}.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 border-t border-emerald-200 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Opening float
              </dt>
              <dd className="mt-1 text-base font-semibold">
                {formatMoney(session.openingFloat, session.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Opened
              </dt>
              <dd className="mt-1 text-base font-semibold">
                {session.openedAtLabel}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Open cash drawer</CardTitle>
        <CardDescription>
          Record the cash already in {activeOrderingPoint.name} before taking cash
          payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-2">
          <label className="text-sm font-medium" htmlFor="opening-float">
            Opening float ({currency})
          </label>
          <Input
            id="opening-float"
            inputMode="decimal"
            min="0"
            onChange={(event) => setOpeningFloat(event.target.value)}
            step="0.01"
            type="number"
            value={openingFloat}
          />
        </div>
        <Button disabled={isSubmitting} onClick={openDrawer} type="button">
          <ButtonLabel icon={isSubmitting ? Loader2 : Banknote}>
            {isSubmitting ? "Opening drawer" : "Open drawer"}
          </ButtonLabel>
        </Button>
      </CardContent>
    </Card>
  );
}
