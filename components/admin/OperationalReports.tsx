"use client";

import { DownloadIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";
import type { OperationalReport, ReportRange } from "@/lib/saas-reports";

type OperationalReportsProps = {
  exportHref?: string;
  isLoading?: boolean;
  onRangeChange?: (range: ReportRange) => void;
  range: ReportRange;
  report: OperationalReport;
};

const rangeOptions: Array<{ label: string; value: ReportRange }> = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function formatLastOrder(value: string | null) {
  if (!value) {
    return "No orders yet";
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date(value));
}

function formatMinutes(value: number | null) {
  if (value == null) {
    return "-";
  }

  if (value < 1) {
    return "< 1 min";
  }

  return `${Math.round(value)} min`;
}

function formatMoney(value: string | null, currency: string) {
  if (value == null) {
    return "-";
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    currency,
    style: "currency",
  }).format(Number(value));
}

function formatTaxComponentLabel(component: {
  name: string;
  rateBps: number;
  treatment: "TAXABLE" | "ZERO_RATED" | "EXEMPT" | "OUT_OF_SCOPE";
}) {
  if (component.treatment === "EXEMPT") {
    return `${component.name} (exempt)`;
  }

  if (component.treatment === "OUT_OF_SCOPE") {
    return `${component.name} (out of scope)`;
  }

  const rate = (component.rateBps / 100).toFixed(2).replace(/\.00$/, "");
  return `${component.name} (${rate}%)`;
}

export function OperationalReports({
  exportHref,
  isLoading = false,
  onRangeChange,
  range,
  report,
}: OperationalReportsProps) {
  return (
    <div className="grid gap-4">
      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Reports
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter operational reporting by period.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              {rangeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  onClick={() => onRangeChange?.(option.value)}
                  disabled={isLoading}
                  variant={option.value === range ? "default" : "outline"}
                  className="rounded-lg px-4 py-2"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {exportHref ? (
              <Button asChild variant="outline" className="rounded-lg px-4 py-2">
                <a href={exportHref}>
                  <ButtonLabel icon={DownloadIcon}>Export CSV</ButtonLabel>
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">
            Financial reconciliation
          </h3>
          <p className="text-sm text-muted-foreground">
            Compares finalized order totals with adjustment, payment, and refund ledgers.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.revenue.financials.length === 0 ? (
            <EmptyReportLine message="No finalized financial orders for this period." />
          ) : null}

          {report.revenue.financials.map((financial) => {
            const mismatchCount =
              financial.adjustmentMismatchOrders +
              financial.paymentMismatchOrders +
              financial.refundMismatchOrders +
              financial.currencyMismatchEntries;
            const taxComponents = (report.revenue.taxComponents ?? []).filter(
              (component) => component.currency === financial.currency,
            );

            return (
              <div
                key={financial.currency}
                className="grid gap-3 rounded-lg border border-border bg-muted/50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {financial.currency}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {financial.orderCount} finalized order(s)
                    </p>
                  </div>
                  <p
                    className={
                      financial.isReconciled
                        ? "text-sm font-semibold text-emerald-700"
                        : "text-sm font-semibold text-amber-700"
                    }
                  >
                    {financial.isReconciled ? "Reconciled" : "Needs review"}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric
                    label="Net sales"
                    valueLabel={formatMoney(financial.netSalesTotal, financial.currency)}
                  />
                  <Metric
                    label="Payments"
                    valueLabel={formatMoney(
                      financial.collectedPaymentTotal,
                      financial.currency,
                    )}
                  />
                  <Metric
                    label="Refunds"
                    valueLabel={formatMoney(financial.refundedTotal, financial.currency)}
                  />
                  <Metric
                    label="Net collected"
                    valueLabel={formatMoney(
                      financial.netCollectedTotal,
                      financial.currency,
                    )}
                  />
                  <Metric
                    label="Outstanding"
                    valueLabel={formatMoney(
                      financial.outstandingBalance,
                      financial.currency,
                    )}
                  />
                  <Metric
                    label="Overpayment"
                    valueLabel={formatMoney(
                      financial.overpaymentAmount,
                      financial.currency,
                    )}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Billed {formatMoney(financial.billedTotal, financial.currency)}:
                  {" "}subtotal {formatMoney(financial.subtotalTotal, financial.currency)},
                  {" "}discounts {formatMoney(financial.discountTotal, financial.currency)},
                  {" "}tax {formatMoney(financial.taxTotal, financial.currency)}, charges{" "}
                  {formatMoney(financial.chargeTotal, financial.currency)}, tips{" "}
                  {formatMoney(financial.tipTotal, financial.currency)}.
                </p>

                {taxComponents.length > 0 ? (
                  <div className="border-t border-border pt-3 text-xs">
                    <p className="font-semibold text-foreground">
                      Issued receipt tax breakdown
                    </p>
                    <div className="mt-2 grid gap-1.5">
                      {taxComponents.map((component) => (
                        <div
                          key={[
                            component.code,
                            component.name,
                            component.treatment,
                            component.rateBps,
                            component.calculationOrder,
                          ].join("-")}
                          className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground"
                        >
                          <span>{formatTaxComponentLabel(component)}</span>
                          <span>
                            Base {formatMoney(
                              component.taxableTotal,
                              component.currency,
                            )}; tax {formatMoney(
                              component.taxTotal,
                              component.currency,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!financial.isReconciled ? (
                  <p className="text-xs font-medium text-amber-700">
                    Review {mismatchCount} ledger mismatch(es),{" "}
                    {financial.pendingRefundCount} pending refund(s), and{" "}
                    {financial.failedRefundCount} failed refund(s).
                  </p>
                ) : null}
              </div>
            );
          })}

          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Unpriced entries" value={report.revenue.unpricedLines} />
            <Metric
              label="Orders missing financial snapshots"
              value={report.revenue.missingSnapshotOrders}
            />
          </div>
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Prep and handoff time</h3>
          <p className="text-sm text-muted-foreground">
            Average item-level timing for the selected period.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <Metric
            label={`${report.timing.preparedItems} prepared items`}
            valueLabel={formatMinutes(report.timing.averagePrepMinutes)}
          />
          <Metric
            label={`${report.timing.deliveredItems} delivered items`}
            valueLabel={formatMinutes(report.timing.averageHandoffMinutes)}
          />
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Cancelled items</h3>
          <p className="text-sm text-muted-foreground">
            Cancelled product entries in the selected period.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.cancelledItems.length === 0 ? (
            <EmptyReportLine message="No cancelled items for this period." />
          ) : null}

          {report.cancelledItems.map((item) => (
            <div
              key={`${item.categoryName}:${item.drinkName}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4"
            >
              <div>
                <p className="font-semibold text-foreground">{item.drinkName}</p>
                <p className="text-sm text-muted-foreground">{item.categoryName}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-rose-700">{item.quantity}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {item.cancelledLines} order entries
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Order status report</h3>
          <p className="text-sm text-muted-foreground">
            Compare selected-period order status with orders created today.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {report.statusBreakdown.map((row) => {
            const todayCount =
              report.todayStatusBreakdown.find((todayRow) => todayRow.status === row.status)
                ?.count ?? 0;

            return (
              <div
                key={row.status}
                className="rounded-lg border border-border bg-muted/50 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {formatStatus(row.status)}
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{row.count}</p>
                <p className="mt-1 text-sm text-muted-foreground">{todayCount} today</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Category mix</h3>
          <p className="text-sm text-muted-foreground">
            Quantity ordered by menu category for the selected period.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.categoryBreakdown.length === 0 ? (
            <EmptyReportLine message="No category data for this period." />
          ) : null}

          {report.categoryBreakdown.map((category) => (
            <div
              key={category.categoryName}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4"
            >
              <div>
                <p className="font-semibold text-foreground">{category.categoryName}</p>
                <p className="text-sm text-muted-foreground">{category.orderLines} order entries</p>
              </div>
              <p className="text-xl font-semibold text-foreground">{category.quantity}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Staff activity</h3>
          <p className="text-sm text-muted-foreground">
            Orders touched by staff members in the selected period.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.staffBreakdown.length === 0 ? (
            <EmptyReportLine message="No staff activity for this period." />
          ) : null}

          {report.staffBreakdown.map((staff) => (
            <div
              key={staff.staffName}
              className="grid gap-3 rounded-lg border border-border bg-muted/50 p-4 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <p className="font-semibold text-foreground">{staff.staffName}</p>
                <p className="text-sm text-muted-foreground">{staff.totalOrders} total orders</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Active" value={staff.activeOrders} />
                <Metric label="Delivered" value={staff.deliveredOrders} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Top products</h3>
          <p className="text-sm text-muted-foreground">
            Highest quantity ordered, excluding cancelled item rows.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.topProducts.length === 0 ? (
            <EmptyReportLine message="No product sales data yet." />
          ) : null}

          {report.topProducts.map((product) => (
            <div
              key={`${product.categoryName}:${product.drinkName}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4"
            >
              <div>
                <p className="font-semibold text-foreground">{product.drinkName}</p>
                <p className="text-sm text-muted-foreground">{product.categoryName}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-foreground">{product.quantity}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {product.orderLines} order entries
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Restaurant activity</h3>
          <p className="text-sm text-muted-foreground">
            Order activity by restaurant.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.restaurantBreakdown.length === 0 ? (
            <EmptyReportLine message="No restaurants to report yet." />
          ) : null}

          {report.restaurantBreakdown.map((restaurant) => (
            <div
              key={restaurant.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/50 p-4 md:grid-cols-[1.2fr_2fr]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{restaurant.name}</p>
                  <span
                    className={
                      restaurant.isActive
                        ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : "rounded-full bg-stone-200 px-2 py-1 text-xs font-semibold text-stone-600"
                    }
                  >
                    {restaurant.isActive ? "Active" : "Disabled"}
                  </span>
                </div>
                {restaurant.label ? (
                  <p className="mt-1 text-sm text-muted-foreground">{restaurant.label}</p>
                ) : null}
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {formatLastOrder(restaurant.lastOrderAt)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Metric label="Total" value={restaurant.totalOrders} />
                <Metric label="Active" value={restaurant.activeOrders} />
                <Metric label="Delivered" value={restaurant.deliveredOrders} />
                <Metric label="Cancelled" value={restaurant.cancelledOrders} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card tone="themed" className="rounded-xl border-border bg-card">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-card-foreground">Stock alerts</h3>
          <p className="text-sm text-muted-foreground">
            Tracked inventory at or below its low-stock threshold.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.lowStock.length === 0 ? (
            <EmptyReportLine message="No low-stock alerts right now." />
          ) : null}

          {report.lowStock.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4"
            >
              <div>
                <p className="font-semibold text-foreground">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  Alert at {item.lowStockThreshold} {item.unit}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={
                    item.status === "out"
                      ? "text-xl font-semibold text-rose-700"
                      : "text-xl font-semibold text-amber-700"
                  }
                >
                  {item.currentQuantity}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {item.status === "out" ? "Out" : "Low"}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function EmptyReportLine({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function Metric({
  label,
  value,
  valueLabel,
}: {
  label: string;
  value?: number;
  valueLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <p className="text-lg font-semibold text-foreground">{valueLabel ?? value ?? 0}</p>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}
