"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrderCard } from "@/components/staff/OrderCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItemStatus, OrderStatus } from "@/lib/constants";
import { DEFAULT_CURRENCY } from "@/lib/locale-defaults";
import {
  orderCorrectionTargets,
  orderItemCorrectionTargets,
  statusCorrectionLabels,
} from "@/lib/order-corrections";

type StaffOrder = {
  orderId: string;
  orderNo: number;
  orderDate?: string | null;
  customerName: string;
  categoryName: string;
  drinkName: string;
  itemCount?: number;
  items?: Array<{
    id?: string;
    categoryId: string;
    categoryName: string;
    drinkId: string;
    drinkName: string;
    quantity: number;
    notes: string | null;
    unitPrice: string | null;
    status: OrderItemStatus;
    startedAt: string | null;
    readyAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
    modifiers?: Array<{
      id?: string;
      modifierGroupId: string;
      modifierGroupName: string;
      modifierId: string;
      modifierName: string;
      quantity: number;
      priceDelta: string;
    }>;
  }>;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type OrdersPayload = {
  activeOrders: StaffOrder[];
  canCorrectStatuses: boolean;
  currency: string;
  pastOrders: StaffOrder[];
};

type StaffTab = "active" | "past";
type StaffOrderItem = NonNullable<StaffOrder["items"]>[number];
type CorrectionTarget =
  | {
      scope: "order";
      order: StaffOrder;
      options: OrderStatus[];
    }
  | {
      scope: "item";
      order: StaffOrder;
      item: StaffOrderItem;
      options: OrderItemStatus[];
    };

function playAnnouncement(customerName: string, drinkName: string) {
  const message = `${customerName}, your ${drinkName} is ready. Please collect it from the bar.`;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function playOrderAnnouncement(customerName: string) {
  const message = `${customerName}, your order is ready. Please collect it from the bar.`;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function StaffOrderBoard() {
  const [orders, setOrders] = useState<OrdersPayload>({
    activeOrders: [],
    canCorrectStatuses: false,
    currency: DEFAULT_CURRENCY,
    pastOrders: [],
  });
  const [activeTab, setActiveTab] = useState<StaffTab>("active");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState("");
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<OrderStatus | OrderItemStatus | "">("");
  const [correctionReason, setCorrectionReason] = useState("");
  const ordersRequestRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  async function syncOrders(options: { showRefreshing?: boolean } = {}) {
    ordersRequestRef.current?.abort();
    const controller = new AbortController();
    ordersRequestRef.current = controller;

    if (options.showRefreshing ?? true) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch("/api/orders", {
        signal: controller.signal,
      });
      const payload = await response.json();

      if (!isMountedRef.current || controller.signal.aborted) {
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Failed to load orders.");
        return;
      }

      setOrders({
        activeOrders: payload.activeOrders ?? [],
        canCorrectStatuses: Boolean(payload.canCorrectStatuses),
        currency: payload.currency ?? DEFAULT_CURRENCY,
        pastOrders: payload.pastOrders ?? [],
      });
      setError(null);
    } catch (fetchError) {
      if (!controller.signal.aborted && isMountedRef.current) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load orders.",
        );
      }
    } finally {
      if (ordersRequestRef.current === controller) {
        ordersRequestRef.current = null;
        if (isMountedRef.current) {
          setIsRefreshing(false);
          setHasLoadedOnce(true);
        }
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const initialLoad = window.setTimeout(() => {
      void syncOrders();
    }, 0);
    const interval = window.setInterval(() => {
      void syncOrders({ showRefreshing: false });
    }, 4000);

    return () => {
      isMountedRef.current = false;
      ordersRequestRef.current?.abort();
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, []);

  async function runItemAction(
    orderId: string,
    itemId: string,
    action: "start" | "ready" | "deliver" | "cancel",
  ) {
    setPendingAction(`${action}-item:${itemId}`);

    const response = await fetch(
      `/api/orders/${orderId}/items/${itemId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to update item.");
      toast.error(payload.error ?? "Failed to update item.");
      setPendingAction(null);
      return;
    }

    await syncOrders();
    const successMessage = {
      start: "Item preparation started.",
      ready: "Item marked ready.",
      deliver: "Item marked delivered.",
      cancel: "Item cancelled.",
    }[action];
    toast.success(successMessage);
    setPendingAction(null);
  }

  function openOrderCorrection(order: StaffOrder) {
    const options = orderCorrectionTargets[order.status];

    if (options.length === 0) {
      return;
    }

    setCorrectionTarget({ scope: "order", order, options });
    setCorrectionStatus(options[0]);
    setCorrectionReason("");
  }

  function openItemCorrection(order: StaffOrder, item: StaffOrderItem) {
    const options = orderItemCorrectionTargets[item.status];

    if (options.length === 0) {
      return;
    }

    setCorrectionTarget({ scope: "item", order, item, options });
    setCorrectionStatus(options[0]);
    setCorrectionReason("");
  }

  async function correctStatus() {
    if (!correctionTarget || !correctionStatus) {
      return;
    }

    const reason = correctionReason.trim();

    if (reason.length < 3) {
      toast.error("Please add a correction reason.");
      return;
    }

    const actionKey =
      correctionTarget.scope === "order"
        ? `correct-order:${correctionTarget.order.orderId}`
        : `correct-item:${correctionTarget.item.id}`;
    const endpoint =
      correctionTarget.scope === "order"
        ? `/api/orders/${correctionTarget.order.orderId}/correct`
        : `/api/orders/${correctionTarget.order.orderId}/items/${correctionTarget.item.id}/correct`;

    setPendingAction(actionKey);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: correctionStatus, reason }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to correct status.");
      toast.error(payload.error ?? "Failed to correct status.");
      setPendingAction(null);
      return;
    }

    await syncOrders();
    setCorrectionTarget(null);
    setCorrectionStatus("");
    setCorrectionReason("");
    toast.success("Status corrected.");
    setPendingAction(null);
  }

  async function runOrderAction(
    orderId: string,
    action: "start" | "ready" | "deliver" | "cancel",
  ) {
    setPendingAction(`${action}-order:${orderId}`);

    const response = await fetch(`/api/orders/${orderId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "cancel" ? JSON.stringify({}) : undefined,
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to update order.");
      toast.error(payload.error ?? "Failed to update order.");
      setPendingAction(null);
      return;
    }

    await syncOrders();
    const successMessage = {
      start: "Order preparation started.",
      ready: "Order marked ready.",
      deliver: "Order marked delivered.",
      cancel: "Order cancelled.",
    }[action];
    toast.success(successMessage);
    setPendingAction(null);
  }

  async function announceItem(
    orderId: string,
    itemId: string,
    customerName: string,
    drinkName: string,
  ) {
    setPendingAction(`announce-item:${itemId}`);
    playAnnouncement(customerName, drinkName);

    const response = await fetch(
      `/api/orders/${orderId}/items/${itemId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "announce" }),
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to record announcement.");
      toast.error(payload.error ?? "Failed to record announcement.");
    }

    setPendingAction(null);
  }

  async function announceOrder(orderId: string, customerName: string) {
    setPendingAction(`announce-order:${orderId}`);
    playOrderAnnouncement(customerName);

    const response = await fetch(`/api/orders/${orderId}/announce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to record announcement.");
      toast.error(payload.error ?? "Failed to record announcement.");
    }

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

    setOrders((current) => ({
      activeOrders: [],
      canCorrectStatuses: current.canCorrectStatuses,
      currency: current.currency,
      pastOrders: [],
    }));
    setError(null);
    setClearConfirmationText("");
    setIsClearDialogOpen(false);
    setHasLoadedOnce(true);
    setIsRefreshing(false);
    toast.success(payload.message ?? "All order records cleared.");
    setPendingAction(null);
  }

  const visibleOrders =
    activeTab === "active" ? orders.activeOrders : orders.pastOrders;

  return (
    <Card className="rounded-xl border-white/60 bg-white/85 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
      <CardHeader className="px-6 pt-6">
        <SectionHeader
          eyebrow="Operations"
          title="Orders panel"
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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StaffTab)}>
          <TabsList>
            <TabsTrigger value="active" disabled={Boolean(pendingAction)}>
              Active Orders ({orders.activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="past" disabled={Boolean(pendingAction)}>
              Past Orders ({orders.pastOrders.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          variant="destructive"
          disabled={Boolean(pendingAction)}
          className="rounded-lg"
          onClick={() => setIsClearDialogOpen(true)}
        >
          <ButtonLabel icon={Trash2Icon}>Clear All Orders</ButtonLabel>
        </Button>
      </div>

      {!hasLoadedOnce && isRefreshing ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="rounded-xl border-stone-200 bg-white shadow-none">
              <CardContent className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-3">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
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
              currency={orders.currency}
              order={order}
              onItemAction={runItemAction}
              onItemAnnounce={announceItem}
              onOrderAction={runOrderAction}
              onOrderAnnounce={announceOrder}
              onCorrectOrder={openOrderCorrection}
              onCorrectItem={openItemCorrection}
              canCorrectStatuses={orders.canCorrectStatuses}
              pendingAction={pendingAction}
              disabled={Boolean(pendingAction)}
            />
          ))}
        </div>
      )}
      </CardContent>
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
                <ButtonLabel icon={Trash2Icon}>Delete All Orders</ButtonLabel>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(correctionTarget)}
        onOpenChange={(open) => {
          if (pendingAction?.startsWith("correct-")) {
            return;
          }

          if (!open) {
            setCorrectionTarget(null);
            setCorrectionStatus("");
            setCorrectionReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Correct {correctionTarget?.scope === "item" ? "item" : "order"} status?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is for fixing an accidental status change. Add a reason so the correction is
              visible in audit logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {correctionTarget ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-sm font-semibold text-stone-900">
                  {correctionTarget.scope === "item"
                    ? correctionTarget.item.drinkName
                    : `Order #${correctionTarget.order.orderNo}`}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Current status:{" "}
                  {statusCorrectionLabels[
                    correctionTarget.scope === "item"
                      ? correctionTarget.item.status
                      : correctionTarget.order.status
                  ]}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">Correct to</p>
                <div className="flex flex-wrap gap-2">
                  {correctionTarget.options.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={correctionStatus === status ? "default" : "outline"}
                      disabled={Boolean(pendingAction)}
                      onClick={() => setCorrectionStatus(status)}
                      className={
                        correctionStatus === status
                          ? "rounded-lg bg-stone-950 text-white hover:bg-stone-800"
                          : "rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                      }
                    >
                      {statusCorrectionLabels[status]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">Correction reason</p>
                <Textarea
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder="Example: Marked delivered by mistake."
                  disabled={Boolean(pendingAction)}
                />
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>
              Keep Status
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                Boolean(pendingAction) ||
                !correctionStatus ||
                correctionReason.trim().length < 3
              }
              onClick={(event) => {
                event.preventDefault();
                void correctStatus();
              }}
            >
              {pendingAction?.startsWith("correct-") ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Correcting...
                </span>
              ) : (
                <ButtonLabel icon={RotateCcwIcon}>Correct Status</ButtonLabel>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
