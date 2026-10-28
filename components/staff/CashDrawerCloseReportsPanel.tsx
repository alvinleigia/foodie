"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import type {
  CashDrawerCloseReport,
  CashDrawerLedgerEntry,
  CashDrawerReportAmount,
} from "@/lib/cash-drawer-close-report-types";

type ReportResponse = { report: CashDrawerCloseReport };

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency,
    style: "currency",
  }).format(Number(amount));
}

function formatDateTime(value: string | null, timezone: string) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sumCounts(rows: Array<{ count: number }>) {
  return rows.reduce((total, row) => total + row.count, 0);
}

function getLedgerEntryDisplay(entry: CashDrawerLedgerEntry) {
  switch (entry.kind) {
    case "CASH_PAYMENT":
      return {
        Icon: Banknote,
        label: entry.orderNo ? `Cash payment for order #${entry.orderNo}` : "Cash payment",
        prefix: "+",
        tone: "text-emerald-700",
      };
    case "CASH_REFUND":
      return {
        Icon: RotateCcw,
        label: entry.orderNo ? `Cash refund for order #${entry.orderNo}` : "Cash refund",
        prefix: "-",
        tone: "text-rose-700",
      };
    case "PAID_IN":
      return {
        Icon: ArrowDownLeft,
        label: entry.reason ?? "Paid in",
        prefix: "+",
        tone: "text-emerald-700",
      };
    case "PAID_OUT":
      return {
        Icon: ArrowUpRight,
        label: entry.reason ?? "Paid out",
        prefix: "-",
        tone: "text-rose-700",
      };
  }
}

function AmountBreakdown({
  emptyLabel,
  rows,
}: {
  emptyLabel: string;
  rows: CashDrawerReportAmount[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <dl className="divide-y rounded-lg border px-4">
      {rows.map((row) => (
        <div
          className="flex items-center justify-between gap-4 py-3 text-sm"
          key={`${row.method}-${row.currency}`}
        >
          <dt>
            <span className="font-medium">{formatLabel(row.method)}</span>
            <span className="ml-2 text-muted-foreground">
              {row.count} transaction{row.count === 1 ? "" : "s"}
            </span>
          </dt>
          <dd className="font-semibold">
            {formatMoney(row.amount, row.currency)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CashDrawerCloseReportsPanel({
  initialReport,
}: {
  initialReport: CashDrawerCloseReport;
}) {
  const [businessDate, setBusinessDate] = useState(initialReport.businessDate);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(initialReport);

  async function loadReport() {
    setError(null);
    setIsLoading(true);

    try {
      const payload = await fetchJson<ReportResponse>(
        `/api/cash-drawer/reports?date=${encodeURIComponent(businessDate)}`,
        { fallbackError: "Close report could not be loaded." },
      );

      setReport(payload.report);
    } catch (caughtError) {
      setError(
        getCaughtErrorMessage(caughtError, "Close report could not be loaded."),
      );
    } finally {
      setIsLoading(false);
    }
  }

  const totalOrders = sumCounts(report.orderStatuses);
  const totalPayments = sumCounts(report.payments);
  const totalRefunds = sumCounts(report.refunds);

  return (
    <Card className="max-w-5xl">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Cash drawer reports</CardTitle>
            <CardDescription>
              Review drawer sessions and cash activity for a business date.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="business-date">
                Business date
              </label>
              <Input
                className="w-40"
                id="business-date"
                onChange={(event) => setBusinessDate(event.target.value)}
                type="date"
                value={businessDate}
              />
            </div>
            <Button disabled={isLoading || !businessDate} onClick={loadReport}>
              <ButtonLabel icon={isLoading ? Loader2 : RefreshCw}>
                {isLoading ? "Loading" : "View report"}
              </ButtonLabel>
            </Button>
            <Button asChild variant="outline">
              <a
                href={`/api/cash-drawer/reports?date=${encodeURIComponent(report.businessDate)}&format=csv`}
              >
                <ButtonLabel icon={Download}>Export CSV</ButtonLabel>
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className={
            report.isReadyToClose
              ? "flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
              : "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"
          }
        >
          {report.isReadyToClose ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold">
              {report.isReadyToClose
                ? "Ready to close"
                : `Close ${report.openDrawers.length} open drawer${report.openDrawers.length === 1 ? "" : "s"} before finalizing the day`}
            </p>
            {report.isReadyToClose ? (
              <p className="mt-1 text-sm">All restaurant drawers are closed.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {report.openDrawers.map((drawer) => (
                  <li key={drawer.id}>
                    {drawer.orderingPointName}, opened {formatDateTime(drawer.openedAt, report.timezone)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          {[
            ["Orders", totalOrders],
            ["Successful payments", totalPayments],
            ["Successful refunds", totalRefunds],
          ].map(([label, value]) => (
            <div className="bg-background p-4" key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Daily cash activity</h3>
          <p className="text-sm text-muted-foreground">
            Cash flows from drawer sessions closed on this business date. Opening
            and closing balances are shown within each session to avoid counting
            carried-forward cash more than once.
          </p>
          {report.cashActivityTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No drawers were closed on this business date.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-3xl text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Currency</th>
                    <th className="px-4 py-3 font-medium">Cash sales</th>
                    <th className="px-4 py-3 font-medium">Cash refunds</th>
                    <th className="px-4 py-3 font-medium">Paid in</th>
                    <th className="px-4 py-3 font-medium">Paid out</th>
                    <th className="px-4 py-3 font-medium">Net movement</th>
                    <th className="px-4 py-3 font-medium">Total variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.cashActivityTotals.map((total) => (
                    <tr key={total.currency}>
                      <td className="px-4 py-3 font-medium">{total.currency}</td>
                      <td className="px-4 py-3">{formatMoney(total.cashSalesAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.cashRefundsAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.paidInAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.paidOutAmount, total.currency)}</td>
                      <td className="px-4 py-3 font-medium">{formatMoney(total.netCashMovementAmount, total.currency)}</td>
                      <td className="px-4 py-3 font-semibold">{formatMoney(total.varianceAmount, total.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Payment totals</h3>
            <AmountBreakdown emptyLabel="No successful payments." rows={report.payments} />
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Refund totals</h3>
            <AmountBreakdown emptyLabel="No successful refunds." rows={report.refunds} />
          </section>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Drawer sessions</h3>
          {report.drawerSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No closed drawer sessions for this business date.
            </p>
          ) : (
            <Accordion className="space-y-2" type="multiple">
              {report.drawerSessions.map((session) => (
                <AccordionItem
                  className="overflow-hidden rounded-lg"
                  key={session.id}
                  value={session.id}
                >
                  <AccordionTrigger className="items-start">
                    <div className="grid flex-1 gap-3 pr-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p>{session.orderingPointName}</p>
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          {session.ledgerEntries.length} ledger entr{session.ledgerEntries.length === 1 ? "y" : "ies"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">Opened</p>
                        <p className="mt-1 font-medium">{formatDateTime(session.openedAt, report.timezone)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">Counted</p>
                        <p className="mt-1 font-medium">{formatMoney(session.countedCashAmount, session.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">Variance</p>
                        <p className="mt-1 font-semibold">{formatMoney(session.varianceAmount, session.currency)}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="border-t pt-4">
                    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ["Opening float", session.openingFloat],
                        ["Cash sales", session.cashSalesAmount],
                        ["Cash refunds", session.cashRefundsAmount],
                        ["Paid in", session.paidInAmount],
                        ["Paid out", session.paidOutAmount],
                        ["Expected", session.expectedCashAmount],
                        ["Counted", session.countedCashAmount],
                        ["Variance", session.varianceAmount],
                      ].map(([label, amount]) => (
                        <div className="bg-background p-3" key={label}>
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="mt-1 font-semibold">{formatMoney(amount, session.currency)}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Closed</p>
                        <p className="mt-1">{formatDateTime(session.closedAt, report.timezone)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Opened by</p>
                        <p className="mt-1">{session.openedByName ?? "Not recorded"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Closed by</p>
                        <p className="mt-1">{session.closedByName ?? "Not recorded"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Closing note</p>
                        <p className="mt-1">{session.closingNote ?? "No closing note"}</p>
                      </div>
                    </div>

                    <div className="mt-5 border-t pt-4">
                      <h4 className="font-semibold">Session ledger</h4>
                      {session.ledgerEntries.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          No cash payments, refunds or manual movements were recorded.
                        </p>
                      ) : (
                        <ul className="mt-3 divide-y rounded-lg border">
                          {session.ledgerEntries.map((entry) => {
                            const display = getLedgerEntryDisplay(entry);
                            const EntryIcon = display.Icon;

                            return (
                              <li className="flex items-start justify-between gap-4 p-4" key={`${entry.kind}-${entry.id}`}>
                                <div className="flex min-w-0 gap-3">
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                    <EntryIcon className="size-4" aria-hidden="true" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-medium">{display.label}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatDateTime(entry.occurredAt, report.timezone)}
                                      {entry.recordedByName ? ` by ${entry.recordedByName}` : ""}
                                    </p>
                                    {entry.tenderedAmount && entry.changeAmount ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Tendered {formatMoney(entry.tenderedAmount, entry.currency)}; change {formatMoney(entry.changeAmount, entry.currency)}
                                      </p>
                                    ) : null}
                                    {entry.note ? (
                                      <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>
                                    ) : null}
                                  </div>
                                </div>
                                <span className={`shrink-0 font-semibold ${display.tone}`}>
                                  {display.prefix}{formatMoney(entry.amount, entry.currency)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>

        {report.orderStatuses.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Orders by status</h3>
            <div className="flex flex-wrap gap-2">
              {report.orderStatuses.map((row) => (
                <span className="rounded-lg border bg-muted/40 px-3 py-2 text-sm" key={row.status}>
                  {formatLabel(row.status)}: <strong>{row.count}</strong>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
