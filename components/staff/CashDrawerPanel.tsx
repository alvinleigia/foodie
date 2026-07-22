"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Loader2,
  RefreshCw,
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
import {
  fetchJson,
  getCaughtErrorMessage,
  requestJson,
} from "@/lib/api-client";
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
  canClose: boolean;
  currency: string;
  initialMovements: CashDrawerMovement[];
  initialReconciliation: CashDrawerReconciliation | null;
  initialSession: OpenCashDrawerSession | null;
  orderingPoint: { id: string; name: string } | null;
  timezone: string;
};

type CashDrawerReconciliation = {
  cashRefundsAmount: string;
  cashSalesAmount: string;
  currency: string;
  expectedCashAmount: string;
  openingFloat: string;
  paidInAmount: string;
  paidOutAmount: string;
  sessionId: string;
};

type ClosedCashDrawerReconciliation = CashDrawerReconciliation & {
  closingNote: string | null;
  countedCashAmount: string;
  id: string;
  varianceAmount: string;
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

type ReconciliationResponse = {
  reconciliation: CashDrawerReconciliation;
};

type CloseSessionResponse = {
  reconciliation: ClosedCashDrawerReconciliation;
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
  canClose,
  currency,
  initialMovements,
  initialReconciliation,
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
  const [reconciliation, setReconciliation] = useState(initialReconciliation);
  const [countedCashAmount, setCountedCashAmount] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [lastClosed, setLastClosed] =
    useState<ClosedCashDrawerReconciliation | null>(null);

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

  async function refreshReconciliation(orderingPointId?: string) {
    const activeOrderingPointId = orderingPointId ?? session?.orderingPointId;

    if (!canClose || !activeOrderingPointId) {
      return;
    }

    setIsRefreshing(true);

    try {
      const payload = await fetchJson<ReconciliationResponse>(
        `/api/cash-drawer/reconciliation?orderingPointId=${encodeURIComponent(activeOrderingPointId)}`,
        { fallbackError: "Drawer totals could not be refreshed." },
      );

      setReconciliation(payload.reconciliation);
    } catch (error) {
      toast.error(
        getCaughtErrorMessage(error, "Drawer totals could not be refreshed."),
      );
    } finally {
      setIsRefreshing(false);
    }
  }

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
      setLastClosed(null);
      setCountedCashAmount("");
      setClosingNote("");

      if (canClose) {
        setReconciliation({
          cashRefundsAmount: "0.00",
          cashSalesAmount: "0.00",
          currency: payload.session.currency,
          expectedCashAmount: payload.session.openingFloat,
          openingFloat: payload.session.openingFloat,
          paidInAmount: "0.00",
          paidOutAmount: "0.00",
          sessionId: payload.session.id,
        });
      }

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
      await refreshReconciliation(session.orderingPointId);
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

  async function closeDrawer() {
    if (!session) {
      return;
    }

    setIsClosing(true);

    try {
      const payload = await requestJson<CloseSessionResponse>(
        "/api/cash-drawer/reconciliation",
        {
          body: {
            closingNote,
            countedCashAmount,
            orderingPointId: session.orderingPointId,
          },
          fallbackError: "Cash drawer could not be closed.",
        },
      );

      setLastClosed(payload.reconciliation);
      setSession(null);
      setMovements([]);
      setReconciliation(null);
      setCountedCashAmount("");
      setClosingNote("");
      toast.success("Cash drawer reconciled and closed.");
    } catch (error) {
      toast.error(
        getCaughtErrorMessage(error, "Cash drawer could not be closed."),
      );
    } finally {
      setIsClosing(false);
    }
  }

  if (session) {
    const countedCash = Number(countedCashAmount);
    const expectedCash = Number(reconciliation?.expectedCashAmount ?? 0);
    const displayedVariance =
      countedCashAmount && Number.isFinite(countedCash)
        ? countedCash - expectedCash
        : null;

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

        {canClose ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Close and reconcile</CardTitle>
                  <CardDescription>
                    Count the till, compare it with the ledger and close this
                    drawer session.
                  </CardDescription>
                </div>
                <Button
                  disabled={isRefreshing}
                  onClick={() => refreshReconciliation()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ButtonLabel icon={RefreshCw}>
                    {isRefreshing ? "Refreshing" : "Refresh totals"}
                  </ButtonLabel>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {reconciliation ? (
                <dl className="divide-y rounded-lg border px-4">
                  {[
                    ["Opening float", reconciliation.openingFloat],
                    ["Cash sales", reconciliation.cashSalesAmount],
                    ["Cash refunds", `-${reconciliation.cashRefundsAmount}`],
                    ["Paid in", reconciliation.paidInAmount],
                    ["Paid out", `-${reconciliation.paidOutAmount}`],
                  ].map(([label, amount]) => (
                    <div
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">
                        {formatMoney(amount, reconciliation.currency)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 py-4">
                    <dt className="font-semibold">Expected cash</dt>
                    <dd className="text-lg font-semibold">
                      {formatMoney(
                        reconciliation.expectedCashAmount,
                        reconciliation.currency,
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Refresh the drawer totals before closing.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="counted-cash">
                    Counted cash ({session.currency})
                  </label>
                  <Input
                    id="counted-cash"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setCountedCashAmount(event.target.value)}
                    step="0.01"
                    type="number"
                    value={countedCashAmount}
                  />
                </div>
                <div className="rounded-lg bg-muted px-4 py-3">
                  <p className="text-sm text-muted-foreground">Variance</p>
                  <p className="mt-1 text-lg font-semibold">
                    {displayedVariance === null
                      ? "Enter counted cash"
                      : formatMoney(
                          displayedVariance.toFixed(2),
                          session.currency,
                        )}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="closing-note">
                  Closing note{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  className="min-h-20"
                  id="closing-note"
                  maxLength={500}
                  onChange={(event) => setClosingNote(event.target.value)}
                  value={closingNote}
                />
              </div>
              <Button
                disabled={
                  isClosing || !reconciliation || !countedCashAmount.trim()
                }
                onClick={closeDrawer}
                type="button"
              >
                <ButtonLabel icon={isClosing ? Loader2 : CheckCircle2}>
                  {isClosing ? "Closing drawer" : "Close and reconcile"}
                </ButtonLabel>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {lastClosed ? (
        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>Drawer reconciled</CardTitle>
            <CardDescription>
              The session is closed and its cash totals are locked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 border-t border-emerald-200 pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Expected</dt>
                <dd className="font-semibold">
                  {formatMoney(
                    lastClosed.expectedCashAmount,
                    lastClosed.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Counted</dt>
                <dd className="font-semibold">
                  {formatMoney(
                    lastClosed.countedCashAmount,
                    lastClosed.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Variance</dt>
                <dd className="font-semibold">
                  {formatMoney(lastClosed.varianceAmount, lastClosed.currency)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
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
    </div>
  );
}
