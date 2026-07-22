"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Loader2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import {
  cashDrawerMovementReasons,
  type CashDrawerMovementType,
} from "@/lib/cash-drawer-movement-reasons";

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
  canAdjust: boolean;
  currency: string;
  initialMovements: CashDrawerMovement[];
  initialSession: OpenCashDrawerSession | null;
  orderingPoint: { id: string; name: string } | null;
  timezone: string;
};

type OpenSessionResponse = {
  session: Omit<OpenCashDrawerSession, "openedAtLabel"> & { openedAt: string };
};

type CashDrawerMovement = {
  amount: string;
  createdAtLabel: string;
  currency: string;
  id: string;
  note: string | null;
  reason: string;
  recordedByName: string | null;
  type: CashDrawerMovementType;
};

type MovementResponse = {
  movement: Omit<CashDrawerMovement, "createdAtLabel"> & { createdAt: string };
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

function formatMovementAmount(movement: CashDrawerMovement) {
  const prefix = movement.type === "PAID_IN" ? "+" : "-";

  return `${prefix}${formatMoney(movement.amount, movement.currency)}`;
}

export function CashDrawerPanel({
  canAdjust,
  currency,
  initialMovements,
  initialSession,
  orderingPoint,
  timezone,
}: CashDrawerPanelProps) {
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMovementSubmitting, setIsMovementSubmitting] = useState(false);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementType, setMovementType] =
    useState<CashDrawerMovementType>("PAID_IN");
  const [movementReason, setMovementReason] = useState<string>(
    cashDrawerMovementReasons.PAID_IN[0],
  );
  const [movements, setMovements] = useState(initialMovements);
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
      setMovements([]);
      toast.success("Cash drawer opened.");
    } catch (error) {
      toast.error(
        getCaughtErrorMessage(error, "Cash drawer could not be opened."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function chooseMovementType(type: CashDrawerMovementType) {
    setMovementType(type);
    setMovementReason(cashDrawerMovementReasons[type][0]);
  }

  async function recordMovement() {
    if (!session) {
      return;
    }

    setIsMovementSubmitting(true);

    try {
      const payload = await requestJson<MovementResponse>(
        "/api/cash-drawer/movements",
        {
          body: {
            amount: movementAmount,
            note: movementNote,
            orderingPointId: session.orderingPointId,
            reason: movementReason,
            type: movementType,
          },
          fallbackError: "Cash movement could not be recorded.",
        },
      );

      setMovements((current) => [
        {
          ...payload.movement,
          createdAtLabel: formatOpenedAt(payload.movement.createdAt, timezone),
        },
        ...current,
      ]);
      setMovementAmount("");
      setMovementNote("");
      toast.success(
        movementType === "PAID_IN" ? "Cash paid in." : "Cash paid out.",
      );
    } catch (error) {
      toast.error(
        getCaughtErrorMessage(error, "Cash movement could not be recorded."),
      );
    } finally {
      setIsMovementSubmitting(false);
    }
  }

  if (session) {
    return (
      <div className="max-w-3xl space-y-6">
        <Card className="border-emerald-200 bg-emerald-50/70">
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

        <Card>
          <CardHeader>
            <CardTitle>Cash movements</CardTitle>
            <CardDescription>
              Record cash added to or removed from this open drawer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {canAdjust ? (
              <div className="space-y-4 border-b pb-6">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  <Button
                    onClick={() => chooseMovementType("PAID_IN")}
                    type="button"
                    variant={movementType === "PAID_IN" ? "default" : "ghost"}
                  >
                    <ArrowDownLeft aria-hidden="true" />
                    Paid in
                  </Button>
                  <Button
                    onClick={() => chooseMovementType("PAID_OUT")}
                    type="button"
                    variant={movementType === "PAID_OUT" ? "default" : "ghost"}
                  >
                    <ArrowUpRight aria-hidden="true" />
                    Paid out
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="movement-amount">
                      Amount ({session.currency})
                    </label>
                    <Input
                      id="movement-amount"
                      inputMode="decimal"
                      min="0.01"
                      onChange={(event) => setMovementAmount(event.target.value)}
                      step="0.01"
                      type="number"
                      value={movementAmount}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Reason</span>
                    <Select
                      onValueChange={setMovementReason}
                      value={movementReason}
                    >
                      <SelectTrigger className="w-full" aria-label="Movement reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cashDrawerMovementReasons[movementType].map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {reason}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="movement-note">
                    Note <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    className="min-h-20"
                    id="movement-note"
                    maxLength={500}
                    onChange={(event) => setMovementNote(event.target.value)}
                    value={movementNote}
                  />
                </div>
                <Button
                  disabled={isMovementSubmitting || !movementAmount}
                  onClick={recordMovement}
                  type="button"
                >
                  <ButtonLabel icon={isMovementSubmitting ? Loader2 : Banknote}>
                    {isMovementSubmitting ? "Recording movement" : "Record movement"}
                  </ButtonLabel>
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Current session history</h3>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No paid-in or paid-out movements yet.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {movements.map((movement) => {
                    const MovementIcon =
                      movement.type === "PAID_IN" ? ArrowDownLeft : ArrowUpRight;

                    return (
                      <li
                        className="flex items-start justify-between gap-4 p-4"
                        key={movement.id}
                      >
                        <div className="flex min-w-0 gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <MovementIcon className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium">{movement.reason}</p>
                            <p className="text-sm text-muted-foreground">
                              {movement.createdAtLabel}
                              {movement.recordedByName
                                ? ` by ${movement.recordedByName}`
                                : ""}
                            </p>
                            {movement.note ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {movement.note}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className={
                            movement.type === "PAID_IN"
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-rose-700"
                          }
                        >
                          {formatMovementAmount(movement)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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
