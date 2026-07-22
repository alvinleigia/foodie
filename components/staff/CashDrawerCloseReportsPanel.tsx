"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";

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
import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import type {
  CashDrawerCloseReport,
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
            <CardTitle>Shift and day close reports</CardTitle>
            <CardDescription>
              Review closed shifts and restaurant totals for a business date.
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
          <h3 className="text-sm font-semibold">Cash reconciliation</h3>
          {report.cashTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No drawers were closed on this business date.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-4xl text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Currency</th>
                    <th className="px-4 py-3 font-medium">Opening</th>
                    <th className="px-4 py-3 font-medium">Cash sales</th>
                    <th className="px-4 py-3 font-medium">Refunds</th>
                    <th className="px-4 py-3 font-medium">Paid in</th>
                    <th className="px-4 py-3 font-medium">Paid out</th>
                    <th className="px-4 py-3 font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Counted</th>
                    <th className="px-4 py-3 font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.cashTotals.map((total) => (
                    <tr key={total.currency}>
                      <td className="px-4 py-3 font-medium">{total.currency}</td>
                      <td className="px-4 py-3">{formatMoney(total.openingFloat, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.cashSalesAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.cashRefundsAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.paidInAmount, total.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(total.paidOutAmount, total.currency)}</td>
                      <td className="px-4 py-3 font-medium">{formatMoney(total.expectedCashAmount, total.currency)}</td>
                      <td className="px-4 py-3 font-medium">{formatMoney(total.countedCashAmount, total.currency)}</td>
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
          <h3 className="text-sm font-semibold">Closed shifts</h3>
          {report.shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No closed shifts for this business date.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-3xl text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ordering point</th>
                    <th className="px-4 py-3 font-medium">Opened</th>
                    <th className="px-4 py-3 font-medium">Closed</th>
                    <th className="px-4 py-3 font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Counted</th>
                    <th className="px-4 py-3 font-medium">Variance</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.shifts.map((shift) => (
                    <tr key={shift.id}>
                      <td className="px-4 py-3 font-medium">{shift.orderingPointName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(shift.openedAt, report.timezone)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(shift.closedAt, report.timezone)}</td>
                      <td className="px-4 py-3">{formatMoney(shift.expectedCashAmount, shift.currency)}</td>
                      <td className="px-4 py-3">{formatMoney(shift.countedCashAmount, shift.currency)}</td>
                      <td className="px-4 py-3 font-semibold">{formatMoney(shift.varianceAmount, shift.currency)}</td>
                      <td className="max-w-64 px-4 py-3 text-muted-foreground">{shift.closingNote ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
