"use client";

import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type MixologistOrder = {
  orderId: string;
  orderNo: number;
  customerName: string;
  categoryName: string;
  drinkName: string;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type OrderCardProps = {
  order: MixologistOrder;
  onAction: (path: string) => Promise<void>;
  onAnnounce: (order: MixologistOrder) => Promise<void>;
  pendingAction: string | null;
  disabled: boolean;
};

export function OrderCard({
  order,
  onAction,
  onAnnounce,
  pendingAction,
  disabled,
}: OrderCardProps) {
  const closedAt = order.deliveredAt ?? order.cancelledAt;
  const isStarting = pendingAction === `start:${order.orderId}`;
  const isReadying = pendingAction === `ready:${order.orderId}`;
  const isDelivering = pendingAction === `deliver:${order.orderId}`;
  const isCancelling = pendingAction === `cancel:${order.orderId}`;
  const isAnnouncing = pendingAction === `announce:${order.orderId}`;

  return (
    <Card className="rounded-xl border-stone-200 bg-white shadow-[0_14px_40px_rgba(40,26,20,0.08)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5 pb-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
            Order #{order.orderNo}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-stone-900">
            {order.customerName}
          </h3>
          <p className="mt-1 text-stone-600">
            {order.drinkName} - {order.categoryName}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </CardHeader>

      <CardContent className="px-5 pt-4 pb-5">
        <p className="text-sm text-stone-500">
          Placed {new Date(order.createdAt).toLocaleTimeString()}
        </p>

        {closedAt ? (
          <p className="mt-2 text-sm text-stone-500">
            {order.status === "DELIVERED" ? "Delivered" : "Cancelled"}{" "}
            {new Date(closedAt).toLocaleTimeString()}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
        {order.status === "PENDING" ? (
          <>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onAction(`/api/orders/${order.orderId}/start`)}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {isStarting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Starting...
                </span>
              ) : (
                "Start Preparing"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onAction(`/api/orders/${order.orderId}/cancel`)}
              className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            >
              {isCancelling ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Cancelling...
                </span>
              ) : (
                "Cancel"
              )}
            </Button>
          </>
        ) : null}

        {order.status === "PREPARING" ? (
          <Button
            type="button"
            disabled={disabled}
            onClick={() => onAction(`/api/orders/${order.orderId}/ready`)}
            className="rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
          >
            {isReadying ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-stone-950" />
                Marking Ready...
              </span>
            ) : (
              "Mark Ready"
            )}
          </Button>
        ) : null}

        {order.status === "READY" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onAnnounce(order)}
              className="rounded-lg border-stone-300 text-stone-900 hover:bg-stone-100"
            >
              {isAnnouncing ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-900" />
                  Playing Message...
                </span>
              ) : (
                "Play Message"
              )}
            </Button>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onAction(`/api/orders/${order.orderId}/deliver`)}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {isDelivering ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Marking Delivered...
                </span>
              ) : (
                "Mark Delivered"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onAction(`/api/orders/${order.orderId}/cancel`)}
              className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            >
              {isCancelling ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Cancelling...
                </span>
              ) : (
                "Cancel"
              )}
            </Button>
          </>
        ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
