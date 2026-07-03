"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { LocalCustomerOrder, OrderLineItem } from "@/lib/constants";
import {
  readStoredCustomerOrders,
  syncCustomerOrdersResetMarker,
  writeStoredCustomerOrders,
} from "@/lib/customer-orders";
import { formatOrderDisplay } from "@/lib/order-display";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrderLineItemRow } from "@/components/shared/OrderLineItemRow";
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
  items?: OrderLineItem[];
  itemCount?: number;
  startedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type CustomerOrderStatusProps = {
  locationQrSlug?: string;
  locationSlug?: string;
  refreshKey: number;
};

function withPublicContext(path: string, options: { locationQrSlug?: string; locationSlug?: string }) {
  const { locationQrSlug, locationSlug } = options;

  if (locationQrSlug) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}qr=${encodeURIComponent(locationQrSlug)}`;
  }

  if (!locationSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}location=${encodeURIComponent(locationSlug)}`;
}

export function CustomerOrderStatus({
  locationQrSlug,
  locationSlug,
  refreshKey,
}: CustomerOrderStatusProps) {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [confirmingCancelOrder, setConfirmingCancelOrder] = useState<ApiOrder | null>(null);
  const statusRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let isMounted = true;
    let hasHydratedStoredOrders = false;

    async function loadOrders() {
      statusRequestRef.current?.abort();
      const controller = new AbortController();
      statusRequestRef.current = controller;

      try {
        const prunedStoredOrders = readStoredCustomerOrders();

        if (!isMounted) {
          return;
        }

        if (!hasHydratedStoredOrders) {
          setOrders(prunedStoredOrders);
          hasHydratedStoredOrders = true;
        }

        if (prunedStoredOrders.length === 0) {
          setIsLoading(false);
          return;
        }

        const response = await fetch(
          withPublicContext("/api/orders/status", { locationQrSlug, locationSlug }),
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            orders: prunedStoredOrders.map((order) => ({
              orderId: order.orderId,
              customerToken: order.customerToken,
            })),
          }),
          },
        );

        if (!isMounted || controller.signal.aborted) {
          return;
        }

        const payload = await response.json();

        if (!isMounted || controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          setError(payload.error ?? "Failed to refresh orders.");
          setIsLoading(false);
          return;
        }

        setCurrency(payload.currency ?? "INR");

        const wasReset = syncCustomerOrdersResetMarker(payload.ordersResetAt ?? null);

        if (wasReset) {
          setOrders([]);
          setError(null);
          setIsLoading(false);
          toast.success("Order history was cleared from the bar system.");
          return;
        }

        const nextOrders = payload.orders.map((order: ApiOrder) => ({
          ...order,
          customerToken:
            prunedStoredOrders.find((storedOrder) => storedOrder.orderId === order.orderId)
              ?.customerToken ?? order.customerToken,
        }));

        writeStoredCustomerOrders(nextOrders);
        setOrders(nextOrders);
        setError(null);
        setIsLoading(false);
      } catch (fetchError) {
        if (!controller.signal.aborted && isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to refresh orders.",
          );
          setIsLoading(false);
        }
      } finally {
        if (statusRequestRef.current === controller) {
          statusRequestRef.current = null;
        }
      }
    }

    loadOrders();
    const interval = window.setInterval(loadOrders, 5000);

    return () => {
      isMounted = false;
      statusRequestRef.current?.abort();
      window.clearInterval(interval);
    };
  }, [locationQrSlug, locationSlug, refreshKey]);

  async function cancelOrder(order: ApiOrder) {
    setPendingCancelId(order.orderId);
    const response = await fetch(
      withPublicContext(`/api/orders/${order.orderId}/cancel`, {
        locationQrSlug,
        locationSlug,
      }),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerToken: order.customerToken }),
      },
    );

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
    writeStoredCustomerOrders(nextOrders);
    toast.success("Order cancelled.");
    setPendingCancelId(null);
    setConfirmingCancelOrder(null);
  }

  return (
    <Card className="rounded-xl border-stone-200/70 bg-white/80 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
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
              className="rounded-xl border-stone-200 bg-stone-50 shadow-none"
            >
              <CardContent className="space-y-4 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-28 rounded-lg" />
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
          {orders.map((order) => {
            const orderDisplay = formatOrderDisplay(order);

            return (
            <Card
              key={order.orderId}
              className="rounded-xl border-stone-200 bg-stone-50 shadow-none"
            >
              <CardContent className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
                    {orderDisplay.label}
                    {orderDisplay.meta ? ` · ${orderDisplay.meta}` : ""}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-stone-900">
                    {order.drinkName}
                  </h3>
                  <p className="text-sm text-stone-600">
                    {order.itemCount ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1} item(s) for {order.customerName}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              {order.items?.length ? (
                <div className="mt-4 grid gap-2">
                  {order.items.map((item) => (
                    <OrderLineItemRow
                      key={item.id ?? `${order.orderId}-${item.drinkId}`}
                      drinkName={item.drinkName}
                      notes={item.notes}
                      quantity={item.quantity}
                      status={item.status}
                      currency={currency}
                      unitPrice={item.unitPrice}
                      modifiers={item.modifiers}
                    />
                  ))}
                </div>
              ) : null}

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
                  className="mt-4 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  {pendingCancelId === order.orderId ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="text-rose-700" />
                      Cancelling...
                    </span>
                  ) : (
                    <ButtonLabel icon={XIcon}>Cancel order</ButtonLabel>
                  )}
                </Button>
              ) : null}
              </CardContent>
            </Card>
            );
          })}
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
                <ButtonLabel icon={XIcon}>Confirm Cancel</ButtonLabel>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
