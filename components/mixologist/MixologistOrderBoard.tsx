"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { OrderCard } from "@/components/mixologist/OrderCard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

type OrdersPayload = {
  activeOrders: MixologistOrder[];
  pastOrders: MixologistOrder[];
};

type MixologistTab = "active" | "past";

function playAnnouncement(customerName: string, drinkName: string) {
  const message = `${customerName}, your ${drinkName} is ready. Please collect your order.`;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function MixologistOrderBoard() {
  const [orders, setOrders] = useState<OrdersPayload>({
    activeOrders: [],
    pastOrders: [],
  });
  const [activeTab, setActiveTab] = useState<MixologistTab>("active");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingCancelOrder, setConfirmingCancelOrder] = useState<MixologistOrder | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState("");

  async function syncOrders() {
    setIsRefreshing(true);
    const response = await fetch("/api/orders");
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to load orders.");
      setIsRefreshing(false);
      setHasLoadedOnce(true);
      return;
    }

    setOrders({
      activeOrders: payload.activeOrders ?? [],
      pastOrders: payload.pastOrders ?? [],
    });
    setError(null);
    setIsRefreshing(false);
    setHasLoadedOnce(true);
  }

  useEffect(() => {
    let isMounted = true;

    async function fetchOrders() {
      const response = await fetch("/api/orders");
      const payload = await response.json();

      if (!response.ok) {
        if (isMounted) {
          setError(payload.error ?? "Failed to load orders.");
          setHasLoadedOnce(true);
        }
        return;
      }

      if (isMounted) {
        setOrders({
          activeOrders: payload.activeOrders ?? [],
          pastOrders: payload.pastOrders ?? [],
        });
        setError(null);
        setHasLoadedOnce(true);
      }
    }

    fetchOrders();
    const interval = window.setInterval(fetchOrders, 4000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  async function runAction(path: string) {
    const actionName = path.split("/").pop() ?? "update";
    const orderId = path.split("/").at(-2) ?? "";
    setPendingAction(`${actionName}:${orderId}`);

    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Action failed.");
      toast.error(payload.error ?? "Action failed.");
      setPendingAction(null);
      return;
    }

    await syncOrders();
    toast.success("Order updated.");
    setPendingAction(null);
  }

  async function clearAllOrders() {
    setPendingAction("clear-all");

    const response = await fetch("/api/orders/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationText: clearConfirmationText }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to clear orders.");
      toast.error(payload.error ?? "Failed to clear orders.");
      setPendingAction(null);
      return;
    }

    setOrders({ activeOrders: [], pastOrders: [] });
    setError(null);
    setClearConfirmationText("");
    setIsClearDialogOpen(false);
    setHasLoadedOnce(true);
    setIsRefreshing(false);
    toast.success(payload.message ?? "All order records cleared.");
    setPendingAction(null);
  }

  async function announce(order: MixologistOrder) {
    setPendingAction(`announce:${order.orderId}`);
    playAnnouncement(order.customerName, order.drinkName);
    await runAction(`/api/orders/${order.orderId}/announce`);
  }

  async function requestAction(path: string) {
    if (path.endsWith("/cancel")) {
      const orderId = path.split("/").at(-2);
      const order = orders.activeOrders.find((item) => item.orderId === orderId);

      if (order) {
        setConfirmingCancelOrder(order);
        return;
      }
    }

    await runAction(path);
  }

  const visibleOrders =
    activeTab === "active" ? orders.activeOrders : orders.pastOrders;

  return (
    <Card className="rounded-[2rem] border-white/60 bg-white/85 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
      <CardHeader className="px-6 pt-6">
        <SectionHeader
          eyebrow="Mixologist"
          title="Orders panel"
          description="Keep live drink prep separate from finished history while the panel keeps polling in the background."
          meta={
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              {pendingAction ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-3.5 text-stone-400" />
                  Updating order...
                </span>
              ) : isRefreshing ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-3.5 text-stone-400" />
                  Refreshing panel...
                </span>
              ) : (
                "Live polling every 4 seconds"
              )}
            </p>
          }
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="px-6 pb-6">
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => setActiveTab("active")}
          disabled={Boolean(pendingAction)}
          variant={activeTab === "active" ? "default" : "outline"}
          className={`rounded-full ${
            activeTab === "active"
              ? "bg-stone-950 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
        >
          Active Orders ({orders.activeOrders.length})
        </Button>
        <Button
          type="button"
          onClick={() => setActiveTab("past")}
          disabled={Boolean(pendingAction)}
          variant={activeTab === "past" ? "default" : "outline"}
          className={`rounded-full ${
            activeTab === "past"
              ? "bg-stone-950 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
        >
          Past Orders ({orders.pastOrders.length})
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={Boolean(pendingAction)}
          className="rounded-full"
          onClick={() => setIsClearDialogOpen(true)}
        >
          Clear All Orders
        </Button>
      </div>

      {!hasLoadedOnce && isRefreshing ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="rounded-[2rem] border-stone-200 bg-white shadow-none">
              <CardContent className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-3">
                  <Skeleton className="h-9 w-32 rounded-2xl" />
                  <Skeleton className="h-9 w-24 rounded-2xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          title={activeTab === "active" ? "No active orders yet" : "No past orders yet"}
          description={
            activeTab === "active"
              ? "This tab keeps refreshing automatically every 4 seconds."
              : "Delivered and cancelled orders will appear here."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onAction={requestAction}
              onAnnounce={announce}
              pendingAction={pendingAction}
              disabled={Boolean(pendingAction)}
            />
          ))}
        </div>
      )}
      </CardContent>
      <AlertDialog
        open={Boolean(confirmingCancelOrder)}
        onOpenChange={(open) => {
          if (!open && !pendingAction) {
            setConfirmingCancelOrder(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the order into past orders. Customers can no longer complete
              or collect it after cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confirmingCancelOrder || Boolean(pendingAction)}
              onClick={(event) => {
                event.preventDefault();

                if (confirmingCancelOrder) {
                  void runAction(`/api/orders/${confirmingCancelOrder.orderId}/cancel`).then(() =>
                    setConfirmingCancelOrder(null),
                  );
                }
              }}
            >
              {pendingAction?.startsWith("cancel:") ? (
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
      <AlertDialog
        open={isClearDialogOpen}
        onOpenChange={(open) => {
          if (pendingAction === "clear-all") {
            return;
          }

          setIsClearDialogOpen(open);

          if (!open) {
            setClearConfirmationText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all order records?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every order from both the active and past tabs.
              To confirm, type <span className="font-semibold text-stone-900">delete</span> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">Type delete to continue</p>
            <Input
              value={clearConfirmationText}
              onChange={(event) => setClearConfirmationText(event.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={pendingAction === "clear-all"}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === "clear-all"}>Keep Records</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingAction === "clear-all" || clearConfirmationText.trim().toLowerCase() !== "delete"}
              onClick={(event) => {
                event.preventDefault();
                void clearAllOrders();
              }}
            >
              {pendingAction === "clear-all" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Clearing...
                </span>
              ) : (
                "Delete All Orders"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
