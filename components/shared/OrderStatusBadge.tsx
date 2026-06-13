import { cn } from "@/lib/utils";

type OrderStatus = "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

const statusClasses: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  PREPARING: "bg-sky-100 text-sky-900",
  READY: "bg-emerald-100 text-emerald-900",
  DELIVERED: "bg-stone-200 text-stone-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-lg px-3 py-1 text-xs font-semibold tracking-[0.12em]",
        statusClasses[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
