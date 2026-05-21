"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CUSTOMER_ORDERS_STORAGE_KEY, LocalCustomerOrder } from "@/lib/constants";
import { readStoredCustomerOrders } from "@/lib/customer-orders";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ApiOrder = LocalCustomerOrder & {
  startedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type CustomerOrderStatusProps = {
  refreshKey: number;
};

export function CustomerOrderStatus({ refreshKey }: CustomerOrderStatusProps) {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [confirmingCancelOrder, setConfirmingCancelOrder] = useState<ApiOrder | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      const prunedStoredOrders = readStoredCustomerOrders();

      if (!isMounted) {
        return;
      }

      setOrders(prunedStoredOrders);

      if (prunedStoredOrders.length === 0) {
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: prunedStoredOrders.map((order) => ({
            orderId: order.orderId,
            customerToken: order.customerToken,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Failed to refresh orders.");
        setIsLoading(false);
        return;
      }

      const nextOrders = payload.orders.map((order: ApiOrder) => ({
        orderId: order.orderId,
        orderNo: order.orderNo,
        customerToken:
          prunedStoredOrders.find((storedOrder) => storedOrder.orderId === order.orderId)
            ?.customerToken ?? "",
        customerName: order.customerName,
        categoryName: order.categoryName,
        drinkName: order.drinkName,
        status: order.status,
        createdAt: order.createdAt,
      }));

      window.localStorage.setItem(
        CUSTOMER_ORDERS_STORAGE_KEY,
        JSON.stringify(nextOrders),
      );

      if (isMounted) {
        setOrders(payload.orders);
        setIsLoading(false);
      }
    }

    loadOrders();
    const interval = window.setInterval(loadOrders, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  async function cancelOrder(order: ApiOrder) {
    setPendingCancelId(order.orderId);
    const response = await fetch(`/api/orders/${order.orderId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerToken: order.customerToken }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to cancel order.");
      toast.error(payload.error ?? "Failed to cancel order.");
      setPendingCancelId(null);
      return;
    }

    const nextOrders = orders.map((item) =>
      item.orderId === order.orderId ? payload : item,
    );
    setOrders(nextOrders);
    window.localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(nextOrders));
    toast.success("Order cancelled.");
    setPendingCancelId(null);
    setConfirmingCancelOrder(null);
  }

  return (
    <Card className="rounded-[2rem] border-stone-200/70 bg-white/80 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
      <CardHeader className="px-6 pt-6">
        <SectionHeader
          eyebrow="Order status"
          title="Your recent orders"
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="px-6 pb-6">

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card
              key={index}
              className="rounded-[1.75rem] border-stone-200 bg-stone-50 shadow-none"
            >
              <CardContent className="space-y-4 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-28 rounded-2xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders on this device yet"
          description="Orders placed here will appear automatically and keep syncing with the bar."
        />
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <Card
              key={order.orderId}
              className="rounded-[1.75rem] border-stone-200 bg-stone-50 shadow-none"
            >
              <CardContent className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
                    Order #{order.orderNo}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-stone-900">
                    {order.drinkName}
                  </h3>
                  <p className="text-sm text-stone-600">
                    {order.categoryName} for {order.customerName}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <p className="mt-4 text-sm text-stone-600">
                {order.status === "PENDING" && "Your order is queued and can still be cancelled."}
                {order.status === "PREPARING" &&
                  "Preparation has started. Cancellation is locked."}
                {order.status === "READY" &&
                  "Your drink is ready. Please collect it."}
                {order.status === "DELIVERED" && "Collected successfully."}
                {order.status === "CANCELLED" && "This order was cancelled."}
              </p>

              {order.status === "PENDING" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingCancelId === order.orderId}
                  onClick={() => setConfirmingCancelOrder(order)}
                  className="mt-4 rounded-2xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  {pendingCancelId === order.orderId ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="text-rose-700" />
                      Cancelling...
                    </span>
                  ) : (
                    "Cancel order"
                  )}
                </Button>
              ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </CardContent>
      <AlertDialog
        open={Boolean(confirmingCancelOrder)}
        onOpenChange={(open) => {
          if (!open && !pendingCancelId) {
            setConfirmingCancelOrder(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This only works while the order is still pending. The customer will see the
              cancellation the next time their device syncs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingCancelId)}>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confirmingCancelOrder || Boolean(pendingCancelId)}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingCancelOrder) {
                  void cancelOrder(confirmingCancelOrder);
                }
              }}
            >
              {pendingCancelId ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Cancelling...
                </span>
              ) : (
                "Confirm Cancel"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
