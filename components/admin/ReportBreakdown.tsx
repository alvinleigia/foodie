import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/date-format";

export type ReportBreakdownRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  activeStaffMemberships: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  lastOrderAt: string | null;
  childRestaurants?: number;
};

type ReportBreakdownProps = {
  title: string;
  description: string;
  emptyMessage: string;
  rows: ReportBreakdownRow[];
  showChildRestaurants?: boolean;
};

function formatLastOrder(value: string | null) {
  if (!value) {
    return "No orders yet";
  }

  return formatAppDateTime(value);
}

export function ReportBreakdown({
  title,
  description,
  emptyMessage,
  rows,
  showChildRestaurants = false,
}: ReportBreakdownProps) {
  return (
    <Card tone="themed" className="rounded-xl border-border bg-card">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-xl font-semibold text-card-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : null}

        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-4 rounded-lg border border-border bg-muted/50 p-4 lg:grid-cols-[1.4fr_2fr]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{row.name}</p>
                <span
                  className={
                    row.isActive
                      ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-full bg-stone-200 px-2 py-1 text-xs font-semibold text-stone-600"
                  }
                >
                  {row.isActive ? "Active" : "Disabled"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{row.slug}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Last order
              </p>
              <p className="text-sm text-foreground">{formatLastOrder(row.lastOrderAt)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {showChildRestaurants ? (
                <Metric label="Restaurants" value={row.childRestaurants ?? 0} />
              ) : null}
              <Metric label="Staff" value={row.activeStaffMemberships} />
              <Metric label="Active orders" value={row.activeOrders} />
              <Metric label="Non-cancelled" value={row.completedOrders} />
              <Metric label="Cancelled" value={row.cancelledOrders} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-lg font-semibold text-card-foreground">{value}</p>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}
