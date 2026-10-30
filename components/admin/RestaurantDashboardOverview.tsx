import Link from "next/link";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  ChefHatIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  Layers3Icon,
  PackageCheckIcon,
  ReceiptTextIcon,
  ShoppingBagIcon,
  StoreIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  WalletCardsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DEFAULT_LOCALE } from "@/lib/locale-defaults";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import type {
  OperationalReport,
  OrderStatusReportRow,
  ReportRange,
} from "@/lib/saas-reports";

export type RestaurantDashboardSummary = {
  currency: string;
  timezone: string;
  activeStaffMemberships: number;
  activeMenuCategories: number;
  activeMenuItems: number;
  activeOrders: number;
  completedOrders: number;
  openCashDrawers: number;
  liveStatusBreakdown: OrderStatusReportRow[];
};

type RestaurantDashboardOverviewProps = {
  isLoading: boolean;
  onRangeChange: (range: ReportRange) => void;
  range: ReportRange;
  report: OperationalReport;
  restaurantSlug: string;
  summary: RestaurantDashboardSummary;
};

const rangeOptions: Array<{ label: string; value: ReportRange }> = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const liveStatuses = [
  { label: "Pending", status: "PENDING", tone: "bg-amber-500" },
  { label: "Preparing", status: "PREPARING", tone: "bg-sky-500" },
  { label: "Assembly", status: "ASSEMBLING", tone: "bg-violet-500" },
  { label: "Ready", status: "READY", tone: "bg-emerald-500" },
] as const;

function formatMoney(value: string | number | null | undefined, currency: string) {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));
}

function formatMinutes(value: number | null) {
  if (value == null) {
    return "No data";
  }

  if (value < 1) {
    return "< 1 min";
  }

  return `${Math.round(value)} min`;
}

function formatFulfilmentType(value: string) {
  if (value === "DINE_IN") {
    return "Dine-in";
  }

  if (value === "PICKUP") {
    return "Takeaway";
  }

  return "Delivery";
}

function getStatusCount(rows: OrderStatusReportRow[], status: string) {
  return rows.find((row) => row.status === status)?.count ?? 0;
}

function DashboardKpi({
  helper,
  icon: Icon,
  label,
  value,
}: {
  helper: string;
  icon: typeof BanknoteIcon;
  label: string;
  value: string;
}) {
  return (
    <Card tone="themed" className="rounded-lg border-border bg-card">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-card-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
      <div>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </CardHeader>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function RestaurantDashboardOverview({
  isLoading,
  onRangeChange,
  range,
  report,
  restaurantSlug,
  summary,
}: RestaurantDashboardOverviewProps) {
  const currency =
    report.revenue.financials[0]?.currency ?? summary.currency;
  const financial = report.revenue.financials.find(
    (row) => row.currency === currency,
  );
  const totalOrders = report.statusBreakdown.reduce(
    (total, row) => total + row.count,
    0,
  );
  const cancelledOrders = getStatusCount(report.statusBreakdown, "CANCELLED");
  const averageOrderValue = financial?.orderCount
    ? Number(financial.netSalesTotal) / financial.orderCount
    : 0;
  const cancellationRate = totalOrders
    ? (cancelledOrders / totalOrders) * 100
    : 0;
  const maxProductQuantity = Math.max(
    ...report.topProducts.map((product) => product.quantity),
    1,
  );
  const fulfilmentTotal = report.fulfilmentBreakdown.reduce(
    (total, row) => total + row.count,
    0,
  );
  const failedRefunds = report.revenue.financials.reduce(
    (total, row) => total + row.failedRefundCount,
    0,
  );
  const pendingRefunds = report.revenue.financials.reduce(
    (total, row) => total + row.pendingRefundCount,
    0,
  );
  const ordersHref = getRestaurantWorkspaceHref(restaurantSlug, "orders");
  const reportsHref = getRestaurantWorkspaceHref(restaurantSlug, "reports");
  const inventoryHref = getRestaurantWorkspaceHref(restaurantSlug, "inventory");
  const cashDrawerHref = getRestaurantWorkspaceHref(
    restaurantSlug,
    "cashDrawer",
  );

  return (
    <div className="grid gap-5" aria-busy={isLoading}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Performance overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sales, service and operational health for the selected period.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {rangeOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              disabled={isLoading}
              variant={option.value === range ? "default" : "ghost"}
              className="rounded-md px-3"
              onClick={() => onRangeChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpi
          icon={CircleDollarSignIcon}
          label="Net sales"
          value={formatMoney(financial?.netSalesTotal, currency)}
          helper={`${financial?.orderCount ?? 0} finalized order(s)`}
        />
        <DashboardKpi
          icon={ReceiptTextIcon}
          label="Orders"
          value={String(totalOrders)}
          helper={`${cancelledOrders} cancelled (${cancellationRate.toFixed(1)}%)`}
        />
        <DashboardKpi
          icon={ShoppingBagIcon}
          label="Average order"
          value={formatMoney(averageOrderValue, currency)}
          helper="Net sales per finalized order"
        />
        <DashboardKpi
          icon={WalletCardsIcon}
          label="Net collected"
          value={formatMoney(financial?.netCollectedTotal, currency)}
          helper={`${formatMoney(financial?.outstandingBalance, currency)} outstanding`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card tone="themed" className="rounded-lg border-border bg-card xl:col-span-7">
          <SectionHeading
            title="Live operations"
            description={`${summary.activeOrders} order(s) currently need operational attention.`}
            action={
              <Button asChild size="sm" variant="outline" className="rounded-lg">
                <Link href={ordersHref}>View orders</Link>
              </Button>
            }
          />
          <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            {liveStatuses.map((item) => (
              <div key={item.status} className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`size-2.5 rounded-full ${item.tone}`} />
                  <span className="text-2xl font-semibold text-foreground">
                    {getStatusCount(summary.liveStatusBreakdown, item.status)}
                  </span>
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">{item.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card tone="themed" className="rounded-lg border-border bg-card xl:col-span-5">
          <SectionHeading
            title="Manager attention"
            description="Items that may need action now."
          />
          <CardContent className="grid gap-2 px-5 pb-5">
            <AttentionRow
              href={inventoryHref}
              icon={PackageCheckIcon}
              label="Low-stock items"
              tone={report.lowStock.length > 0 ? "warning" : "success"}
              value={String(report.lowStock.length)}
            />
            <AttentionRow
              href={reportsHref}
              icon={AlertTriangleIcon}
              label="Failed refunds"
              tone={failedRefunds > 0 ? "danger" : "success"}
              value={String(failedRefunds)}
            />
            <AttentionRow
              href={reportsHref}
              icon={Clock3Icon}
              label="Pending refunds"
              tone={pendingRefunds > 0 ? "warning" : "success"}
              value={String(pendingRefunds)}
            />
            <AttentionRow
              href={cashDrawerHref}
              icon={BanknoteIcon}
              label="Open cash drawers"
              tone={summary.openCashDrawers > 0 ? "neutral" : "success"}
              value={String(summary.openCashDrawers)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card tone="themed" className="rounded-lg border-border bg-card">
          <SectionHeading
            title="Top products"
            description="Highest quantity sold in this period."
          />
          <CardContent className="grid gap-4 px-5 pb-5">
            {report.topProducts.length === 0 ? (
              <EmptyLine>No product sales in this period.</EmptyLine>
            ) : null}
            {report.topProducts.map((product, index) => (
              <div key={`${product.categoryName}:${product.drinkName}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {index + 1}. {product.drinkName}
                    </p>
                    <p className="text-xs text-muted-foreground">{product.categoryName}</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {product.quantity}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.max(8, (product.quantity / maxProductQuantity) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card tone="themed" className="rounded-lg border-border bg-card">
          <SectionHeading
            title="Order mix"
            description="How guests chose to receive their orders."
          />
          <CardContent className="grid gap-4 px-5 pb-5">
            {report.fulfilmentBreakdown.map((row) => {
              const share = fulfilmentTotal ? (row.count / fulfilmentTotal) * 100 : 0;

              return (
                <div key={row.fulfilmentType}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">
                      {formatFulfilmentType(row.fulfilmentType)}
                    </span>
                    <span className="text-muted-foreground">
                      {row.count} ({share.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card tone="themed" className="rounded-lg border-border bg-card">
          <SectionHeading
            title="Payment mix"
            description="Successful payments for orders in this period."
          />
          <CardContent className="grid gap-3 px-5 pb-5">
            {report.paymentMethodBreakdown.length === 0 ? (
              <EmptyLine>No successful payments in this period.</EmptyLine>
            ) : null}
            {report.paymentMethodBreakdown.map((row) => (
              <div
                key={`${row.method}:${row.currency}`}
                className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-muted text-foreground">
                    {row.method === "CASH" ? (
                      <BanknoteIcon className="size-4" />
                    ) : (
                      <WalletCardsIcon className="size-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {row.method === "CASH" ? "Cash" : "Online"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} payment(s)
                    </p>
                  </div>
                </div>
                <p className="font-semibold text-foreground">
                  {formatMoney(row.amount, row.currency)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card tone="themed" className="rounded-lg border-border bg-card">
          <SectionHeading
            title="Kitchen performance"
            description="Average item preparation and handoff times."
          />
          <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <CompactMetric
              icon={ChefHatIcon}
              label={`${report.timing.preparedItems} prepared items`}
              value={formatMinutes(report.timing.averagePrepMinutes)}
            />
            <CompactMetric
              icon={Clock3Icon}
              label={`${report.timing.deliveredItems} handed-off items`}
              value={formatMinutes(report.timing.averageHandoffMinutes)}
            />
          </CardContent>
        </Card>

        <Card tone="themed" className="rounded-lg border-border bg-card">
          <SectionHeading
            title="Restaurant setup"
            description="Current staffing and menu coverage."
          />
          <CardContent className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4">
            <CompactMetric
              icon={UsersIcon}
              label="Active staff"
              value={String(summary.activeStaffMemberships)}
            />
            <CompactMetric
              icon={Layers3Icon}
              label="Categories"
              value={String(summary.activeMenuCategories)}
            />
            <CompactMetric
              icon={UtensilsCrossedIcon}
              label="Menu items"
              value={String(summary.activeMenuItems)}
            />
            <CompactMetric
              icon={StoreIcon}
              label="Non-cancelled"
              value={String(summary.completedOrders)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AttentionRow({
  href,
  icon: Icon,
  label,
  tone,
  value,
}: {
  href: string;
  icon: typeof BanknoteIcon;
  label: string;
  tone: "danger" | "neutral" | "success" | "warning";
  value: string;
}) {
  const toneClass = {
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    neutral: "bg-muted text-foreground",
    success:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  }[tone];

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-muted/60"
    >
      <span className="flex items-center gap-3 text-sm font-medium text-foreground">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {label}
      </span>
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${toneClass}`}>
        {value}
      </span>
    </Link>
  );
}

function CompactMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BanknoteIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
