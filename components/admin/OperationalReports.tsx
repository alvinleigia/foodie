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

function formatMoney(value: number | null) {
  if (value == null) {
    return "-";
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
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
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Reports
            </p>
            <p className="mt-1 text-sm text-stone-500">
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
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Revenue report</h3>
          <p className="text-sm text-stone-500">
            Uses priced, non-cancelled order entries only. Price-on-request entries stay separate.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <Metric label={`${report.revenue.pricedLines} priced entries`} valueLabel={formatMoney(report.revenue.grossRevenue)} />
          <Metric
            label="Average priced entry"
            valueLabel={formatMoney(report.revenue.averagePricedLineValue)}
          />
          <Metric label="Unpriced entries" value={report.revenue.unpricedLines} />
          <Metric label="Revenue range" valueLabel={range} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Prep and collection time</h3>
          <p className="text-sm text-stone-500">
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
            valueLabel={formatMinutes(report.timing.averageCollectionMinutes)}
          />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Cancelled items</h3>
          <p className="text-sm text-stone-500">
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
              className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div>
                <p className="font-semibold text-stone-950">{item.drinkName}</p>
                <p className="text-sm text-stone-500">{item.categoryName}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-rose-700">{item.quantity}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
                  {item.cancelledLines} order entries
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Order status report</h3>
          <p className="text-sm text-stone-500">
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
                className="rounded-lg border border-stone-200 bg-stone-50 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                  {formatStatus(row.status)}
                </p>
                <p className="mt-2 text-3xl font-semibold text-stone-950">{row.count}</p>
                <p className="mt-1 text-sm text-stone-500">{todayCount} today</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Category mix</h3>
          <p className="text-sm text-stone-500">
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
              className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div>
                <p className="font-semibold text-stone-950">{category.categoryName}</p>
                <p className="text-sm text-stone-500">{category.orderLines} order entries</p>
              </div>
              <p className="text-xl font-semibold text-stone-950">{category.quantity}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Staff activity</h3>
          <p className="text-sm text-stone-500">
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
              className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <p className="font-semibold text-stone-950">{staff.staffName}</p>
                <p className="text-sm text-stone-500">{staff.totalOrders} total orders</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Active" value={staff.activeOrders} />
                <Metric label="Delivered" value={staff.deliveredOrders} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Top products</h3>
          <p className="text-sm text-stone-500">
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
              className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div>
                <p className="font-semibold text-stone-950">{product.drinkName}</p>
                <p className="text-sm text-stone-500">{product.categoryName}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-stone-950">{product.quantity}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
                  {product.orderLines} order entries
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Location activity</h3>
          <p className="text-sm text-stone-500">
            Order activity by operating location.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {report.locationBreakdown.length === 0 ? (
            <EmptyReportLine message="No locations to report yet." />
          ) : null}

          {report.locationBreakdown.map((location) => (
            <div
              key={location.id}
              className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1.2fr_2fr]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-stone-950">{location.name}</p>
                  <span
                    className={
                      location.isActive
                        ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : "rounded-full bg-stone-200 px-2 py-1 text-xs font-semibold text-stone-600"
                    }
                  >
                    {location.isActive ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  {location.label ?? "No label"}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-400">
                  {formatLastOrder(location.lastOrderAt)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Metric label="Total" value={location.totalOrders} />
                <Metric label="Active" value={location.activeOrders} />
                <Metric label="Delivered" value={location.deliveredOrders} />
                <Metric label="Cancelled" value={location.cancelledOrders} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Stock alerts</h3>
          <p className="text-sm text-stone-500">
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
              className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div>
                <p className="font-semibold text-stone-950">{item.productName}</p>
                <p className="text-sm text-stone-500">
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
                <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
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
    <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
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
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="text-lg font-semibold text-stone-950">{valueLabel ?? value ?? 0}</p>
      <p className="text-xs uppercase tracking-[0.14em] text-stone-400">{label}</p>
    </div>
  );
}
