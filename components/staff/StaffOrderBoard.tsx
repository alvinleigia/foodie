"use client";

import { useEffect, useRef, useState } from "react";
import {
  BanknoteIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  OrderCard,
  type StaffOrder,
  type StaffOrderItem,
} from "@/components/staff/OrderCard";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  allocateRefundAcrossPayments,
  calculateCancellationAmounts,
} from "@/lib/order-cancellation-financials";
import { minorUnitsToDecimal } from "@/lib/currency-money";
import {
  calculateCashSettlement,
  calculatePaymentBalance,
} from "@/lib/order-payment-financials";
import {
  orderCorrectionTargets,
  orderItemCorrectionTargets,
  statusCorrectionLabels,
} from "@/lib/order-corrections";

type OrdersPayload = {
  activeOrders: StaffOrder[];
  canCorrectStatuses: boolean;
  canManageRefunds: boolean;
  currency: string;
  pastOrders: StaffOrder[];
};

type StaffTab = "active" | "past";
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

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency",
  }).format(amount);
}

export function StaffOrderBoard({
  stripePaymentsEnabled = true,
}: {
  stripePaymentsEnabled?: boolean;
}) {
  const [orders, setOrders] = useState<OrdersPayload>({
    activeOrders: [],
    canCorrectStatuses: false,
    canManageRefunds: false,
    currency: DEFAULT_CURRENCY,
    pastOrders: [],
  });
  const [activeTab, setActiveTab] = useState<StaffTab>("active");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<OrderStatus | OrderItemStatus | "">("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [cancellationTarget, setCancellationTarget] =
    useState<StaffOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [applyCustomerCancellationFee, setApplyCustomerCancellationFee] =
    useState(false);
  const [cancellationFeePercent, setCancellationFeePercent] = useState(0);
  const [settlementTarget, setSettlementTarget] =
    useState<StaffOrder | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
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
        canManageRefunds: Boolean(payload.canManageRefunds),
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
    if (action === "cancel") {
      const order = [...orders.activeOrders, ...orders.pastOrders].find(
        (candidate) => candidate.orderId === orderId,
      );

      if (order) {
        setCancellationTarget(order);
        setCancellationReason("");
        setApplyCustomerCancellationFee(false);
        setCancellationFeePercent(order.customerCancellationFeeBps / 100);
      }

      return;
    }

    setPendingAction(`${action}-order:${orderId}`);

    const response = await fetch(`/api/orders/${orderId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    }[action];
    toast.success(successMessage);
    setPendingAction(null);
  }

  async function cancelSelectedOrder() {
    if (!cancellationTarget) {
      return;
    }

    const actionKey = `cancel-order:${cancellationTarget.orderId}`;
    setPendingAction(actionKey);
    const response = await fetch(
      `/api/orders/${cancellationTarget.orderId}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applyCustomerCancellationFee,
          cancellationFeePercent: applyCustomerCancellationFee
            ? cancellationFeePercent
            : undefined,
          cancelReason: cancellationReason,
          overrideReason: applyCustomerCancellationFee
            ? cancellationReason
            : undefined,
        }),
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to cancel order.");
      toast.error(payload.error ?? "Failed to cancel order.");
      setPendingAction(null);
      return;
    }

    await syncOrders();
    setCancellationTarget(null);
    setCancellationReason("");
    setApplyCustomerCancellationFee(false);

    if (payload.refundError) {
      toast.error("Order cancelled, but its refund needs attention.");
    } else {
      toast.success("Order cancelled.");
    }

    setPendingAction(null);
  }

  async function retryRefund(order: StaffOrder) {
    const actionKey = `refund-order:${order.orderId}`;
    setPendingAction(actionKey);
    const response = await fetch(`/api/orders/${order.orderId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retryRefund: true }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to retry refund.");
      toast.error(payload.error ?? "Failed to retry refund.");
      setPendingAction(null);
      return;
    }

    await syncOrders();

    if (payload.refundError) {
      toast.error("Refund failed again. Check the Stripe account and retry.");
    } else {
      toast.success("Refund submitted.");
    }

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

  function openSettlement(order: StaffOrder) {
    const currency = order.paymentCurrency ?? orders.currency;
    let remainingAmount = order.paymentAmount ?? "";

    if (order.paymentAmount) {
      remainingAmount = calculatePaymentBalance({
        amount: order.paymentAmount,
        collectedAmount: order.paymentCollectedAmount,
        currency,
      }).remainingAmount;
    }

    setSettlementTarget(order);
    setCashAmount(remainingAmount);
    setCashTendered(remainingAmount);
    setCheckoutUrl(null);
  }

  async function collectCashPayment() {
    if (!settlementTarget) {
      return;
    }

    const actionKey = `cash-payment:${settlementTarget.orderId}`;
    setPendingAction(actionKey);

    try {
      const response = await fetch(
        `/api/orders/${settlementTarget.orderId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: cashAmount,
            method: "CASH",
            tenderedAmount: cashTendered,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Cash payment could not be recorded.");
      }

      await syncOrders();
      const currency = settlementTarget.paymentCurrency ?? orders.currency;
      const changeMessage = `Change due: ${formatMoney(
        Number(payload.changeAmount ?? 0),
        currency,
      )}.`;

      if (payload.paymentStatus === "PAID") {
        toast.success(`Bill paid. ${changeMessage}`);
        setSettlementTarget(null);
        setCashAmount("");
        setCashTendered("");
        setCheckoutUrl(null);
      } else {
        const nextOrder = {
          ...settlementTarget,
          paymentAmount: payload.paymentAmount,
          paymentCollectedAmount: payload.paymentCollectedAmount,
          paymentMethod: "CASH" as const,
          paymentStatus: "PARTIALLY_PAID" as const,
        };
        const balance = calculatePaymentBalance({
          amount: nextOrder.paymentAmount,
          collectedAmount: nextOrder.paymentCollectedAmount,
          currency,
        });
        setSettlementTarget(nextOrder);
        setCashAmount(balance.remainingAmount);
        setCashTendered(balance.remainingAmount);
        setCheckoutUrl(null);
        toast.success(
          `Partial cash payment recorded. ${changeMessage} ${formatMoney(
            Number(balance.remainingAmount),
            currency,
          )} remains.`,
        );
      }
      setError(null);
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : "Cash payment could not be recorded.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function loadStripePaymentLink() {
    if (!settlementTarget) {
      return;
    }

    const actionKey = `stripe-payment:${settlementTarget.orderId}`;
    setPendingAction(actionKey);

    try {
      const response = await fetch(
        `/api/orders/${settlementTarget.orderId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "STRIPE_CHECKOUT" }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Stripe payment link could not be created.",
        );
      }

      await syncOrders();

      if (payload.paymentStatus === "PAID") {
        toast.success("This bill has already been paid.");
        setSettlementTarget(null);
        setCashAmount("");
        setCashTendered("");
        setCheckoutUrl(null);
      } else if (payload.checkoutUrl) {
        setSettlementTarget((current) =>
          current
            ? {
                ...current,
                paymentAmount: payload.paymentAmount ?? current.paymentAmount,
                paymentCollectedAmount:
                  payload.paymentCollectedAmount ??
                  current.paymentCollectedAmount,
                paymentMethod: "STRIPE_CHECKOUT",
                paymentStatus: "PENDING",
              }
            : current,
        );
        setCheckoutUrl(payload.checkoutUrl);
        toast.success("Stripe payment link is ready.");
      } else {
        toast.success("Stripe is confirming this payment.");
      }

      setError(null);
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : "Stripe payment link could not be created.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function copyCheckoutLink() {
    if (!checkoutUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(checkoutUrl);
      toast.success("Payment link copied.");
    } catch {
      toast.error("The payment link could not be copied.");
    }
  }

  async function cancelPaymentRequest(order: StaffOrder) {
    const actionKey = `cancel-payment:${order.orderId}`;
    setPendingAction(actionKey);

    try {
      const response = await fetch(`/api/orders/${order.orderId}/payments`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "The payment request could not be cancelled.",
        );
      }

      await syncOrders();
      setSettlementTarget(null);
      setCashAmount("");
      setCashTendered("");
      setCheckoutUrl(null);
      setError(null);
      toast.success(
        payload.paymentStatus === "PARTIALLY_PAID"
          ? "Payment request cancelled. The collected portion is retained and the balance remains due."
          : "Payment request cancelled. The bill is unpaid again.",
      );
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : "The payment request could not be cancelled.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  const visibleOrders =
    activeTab === "active" ? orders.activeOrders : orders.pastOrders;
  const settlementCurrency =
    settlementTarget?.paymentCurrency ?? orders.currency;
  let settlementBalance: ReturnType<typeof calculatePaymentBalance> | null =
    null;
  let cashChangeAmount: string | null = null;
  let cashPaymentError: string | null = null;

  if (settlementTarget?.paymentAmount) {
    try {
      settlementBalance = calculatePaymentBalance({
        amount: settlementTarget.paymentAmount,
        collectedAmount: settlementTarget.paymentCollectedAmount,
        currency: settlementCurrency,
      });

      if (cashAmount.trim().length > 0 && cashTendered.trim().length > 0) {
        const cash = calculateCashSettlement({
          amount: cashAmount,
          currency: settlementCurrency,
          tenderedAmount: cashTendered,
        });

        if (cash.amountMinor > settlementBalance.remainingMinor) {
          throw new Error("The cash amount cannot exceed the remaining balance.");
        }

        cashChangeAmount = cash.changeAmount;
      }
    } catch (balanceError) {
      cashPaymentError = balanceError instanceof Error
        ? balanceError.message
        : "Enter a valid amount.";
    }
  }
  const cancellationFeeBps = applyCustomerCancellationFee
    ? Math.round(cancellationFeePercent * 100)
    : 0;
  const cancellationHasCollectedPayment =
    cancellationTarget?.paymentStatus === "PAID" ||
    cancellationTarget?.paymentStatus === "PARTIALLY_PAID";
  const cancellationFinancials =
    cancellationHasCollectedPayment &&
    cancellationTarget &&
    Number(cancellationTarget.paymentCollectedAmount) > 0 &&
    Number.isFinite(cancellationFeeBps) &&
    cancellationFeeBps >= 0 &&
    cancellationFeeBps <= cancellationTarget.customerCancellationFeeBps
      ? calculateCancellationAmounts({
          amount: cancellationTarget.paymentCollectedAmount,
          currency:
            cancellationTarget.paymentCurrency ?? orders.currency,
          feeBps: cancellationFeeBps,
        })
      : null;
  let cancellationRefundAllocations: ReturnType<
    typeof allocateRefundAcrossPayments
  > = [];

  if (
    cancellationTarget &&
    cancellationFinancials &&
    cancellationFinancials.refundMinor > 0
  ) {
    try {
      cancellationRefundAllocations = allocateRefundAcrossPayments({
        currency: cancellationTarget.paymentCurrency ?? orders.currency,
        payments: cancellationTarget.paymentPortions.map((payment, index) => ({
          ...payment,
          id: `${payment.method}-${index}`,
        })),
        refundAmount: cancellationFinancials.refundAmount,
      });
    } catch {
      cancellationRefundAllocations = [];
    }
  }

  const cashReturnMinor = cancellationRefundAllocations
    .filter((allocation) => allocation.method === "CASH")
    .reduce((total, allocation) => total + allocation.amountMinor, 0);
  const stripeRefundMinor = cancellationRefundAllocations
    .filter((allocation) => allocation.method === "STRIPE_CHECKOUT")
    .reduce((total, allocation) => total + allocation.amountMinor, 0);

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
              onSettleOrder={openSettlement}
              onCancelPayment={cancelPaymentRequest}
              canCorrectStatuses={orders.canCorrectStatuses}
              canManageRefunds={orders.canManageRefunds}
              onRetryRefund={retryRefund}
              pendingAction={pendingAction}
              disabled={Boolean(pendingAction)}
            />
          ))}
        </div>
      )}
      </CardContent>
      <Dialog
        open={Boolean(settlementTarget)}
        onOpenChange={(open) => {
          if (
            pendingAction?.startsWith("cash-payment:") ||
            pendingAction?.startsWith("stripe-payment:") ||
            pendingAction?.startsWith("cancel-payment:")
          ) {
            return;
          }

          if (!open) {
            setSettlementTarget(null);
            setCashAmount("");
            setCashTendered("");
            setCheckoutUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-lg p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-stone-200 px-6 py-5">
            <DialogTitle className="text-lg font-semibold text-stone-950">
              Settle bill
            </DialogTitle>
            <DialogDescription>
              Record full or partial cash, then collect any remaining balance
              through cash or Stripe.
            </DialogDescription>
          </DialogHeader>

          {settlementTarget ? (
            <div className="grid gap-5 overflow-y-auto px-6 py-5">
              <div className="border-b border-stone-200 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                  <p className="text-xs font-medium uppercase text-stone-500">
                    Order #{settlementTarget.orderNo}
                  </p>
                  <p className="mt-1 font-semibold text-stone-950">
                    {settlementTarget.customerName}
                  </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-xs text-stone-500">Total</dt>
                    <dd className="mt-1 text-sm font-semibold text-stone-950">
                      {settlementTarget.paymentAmount
                        ? formatMoney(
                            Number(settlementTarget.paymentAmount),
                            settlementCurrency,
                          )
                        : "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Collected</dt>
                    <dd className="mt-1 text-sm font-semibold text-emerald-800">
                      {formatMoney(
                        Number(settlementTarget.paymentCollectedAmount),
                        settlementCurrency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Remaining</dt>
                    <dd className="mt-1 text-sm font-semibold text-amber-900">
                      {settlementBalance
                        ? formatMoney(
                            Number(settlementBalance.remainingAmount),
                            settlementCurrency,
                          )
                        : "Unavailable"}
                    </dd>
                  </div>
                </dl>
              </div>

              {settlementTarget.paymentStatus === "UNPAID" ||
              settlementTarget.paymentStatus === "PARTIALLY_PAID" ? (
                <>
                  <section aria-labelledby="cash-payment-heading">
                    <div className="flex items-center gap-2">
                      <BanknoteIcon className="size-4 text-emerald-700" />
                      <h3
                        id="cash-payment-heading"
                        className="font-semibold text-stone-950"
                      >
                        Cash
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">
                      Choose how much of the remaining balance to collect, then
                      enter the cash received.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="min-w-0 text-sm font-medium text-stone-700">
                        Amount to apply
                        <Input
                          className="mt-2"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={cashAmount}
                          disabled={Boolean(pendingAction)}
                          onChange={(event) => setCashAmount(event.target.value)}
                        />
                      </label>
                      <label className="min-w-0 text-sm font-medium text-stone-700">
                        Cash received
                        <Input
                          className="mt-2"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={cashTendered}
                          disabled={Boolean(pendingAction)}
                          onChange={(event) => setCashTendered(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(pendingAction) || !cashAmount}
                        onClick={() => setCashTendered(cashAmount)}
                      >
                        Exact cash
                      </Button>
                    </div>
                    <div className="mt-3 flex min-h-5 items-center justify-between gap-4 text-sm">
                      <span
                        className={
                          cashPaymentError ? "text-rose-600" : "text-stone-600"
                        }
                      >
                        {cashPaymentError ?? "Change due"}
                      </span>
                      {!cashPaymentError && cashChangeAmount ? (
                        <span className="font-semibold text-stone-950">
                          {formatMoney(
                            Number(cashChangeAmount),
                            settlementCurrency,
                          )}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      className="mt-4 w-full bg-stone-950 text-white hover:bg-stone-800"
                      disabled={
                        Boolean(pendingAction) ||
                        !settlementBalance ||
                        settlementBalance.remainingMinor <= 0 ||
                        !cashChangeAmount ||
                        Boolean(cashPaymentError)
                      }
                      onClick={() => void collectCashPayment()}
                    >
                      {pendingAction ===
                      `cash-payment:${settlementTarget.orderId}` ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="text-white" />
                          Recording cash...
                        </span>
                      ) : (
                        <ButtonLabel icon={BanknoteIcon}>
                          Confirm cash payment
                        </ButtonLabel>
                      )}
                    </Button>
                  </section>

                  {stripePaymentsEnabled ? (
                    <section
                      aria-labelledby="online-payment-heading"
                      className="border-t border-stone-200 pt-5"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="size-4 text-sky-700" />
                        <h3
                          id="online-payment-heading"
                          className="font-semibold text-stone-950"
                        >
                          Online payment
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-stone-600">
                        Create a Stripe Checkout link for the remaining balance of{" "}
                        {settlementBalance
                          ? formatMoney(
                              Number(settlementBalance.remainingAmount),
                              settlementCurrency,
                            )
                          : "this bill"}
                        .
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        disabled={Boolean(pendingAction)}
                        onClick={() => void loadStripePaymentLink()}
                      >
                        {pendingAction ===
                        `stripe-payment:${settlementTarget.orderId}` ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner className="text-stone-700" />
                            Creating link...
                          </span>
                        ) : (
                          <ButtonLabel icon={CreditCardIcon}>
                            Create Stripe payment link
                          </ButtonLabel>
                        )}
                      </Button>
                    </section>
                  ) : null}
                </>
              ) : settlementTarget.paymentStatus === "PENDING" ? (
                <section aria-labelledby="pending-payment-heading">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="size-4 text-sky-700" />
                    <h3
                      id="pending-payment-heading"
                      className="font-semibold text-stone-950"
                    >
                      Stripe Checkout
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    The bill stays open until Stripe confirms the payment.
                  </p>
                  {!checkoutUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void loadStripePaymentLink()}
                    >
                      {pendingAction ===
                      `stripe-payment:${settlementTarget.orderId}` ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="text-stone-700" />
                          Loading link...
                        </span>
                      ) : (
                        "Load payment link"
                      )}
                    </Button>
                  ) : null}

                  {checkoutUrl ? (
                    <div className="mt-4">
                      <div className="grid justify-items-center gap-3 border-y border-stone-200 py-5 text-center">
                        <div className="grid aspect-square w-full max-w-60 place-items-center overflow-hidden rounded-lg border border-stone-200 bg-white p-3">
                          <QRCodeSVG
                            value={checkoutUrl}
                            size={216}
                            level="M"
                            marginSize={4}
                            title={`Stripe payment QR for order ${settlementTarget.orderNo}`}
                            className="h-auto w-full max-w-54"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-stone-950">
                            Scan to pay {settlementBalance
                              ? formatMoney(
                                  Number(settlementBalance.remainingAmount),
                                  settlementCurrency,
                                )
                              : "this bill"}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            Order #{settlementTarget.orderNo}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button asChild className="flex-1 bg-stone-950 text-white">
                          <a
                            href={checkoutUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLinkIcon />
                            Open Checkout
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={() => void copyCheckoutLink()}
                        >
                          <CopyIcon />
                          Copy link
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-stone-300 text-stone-800"
                    disabled={Boolean(pendingAction)}
                    onClick={() => void cancelPaymentRequest(settlementTarget)}
                  >
                    {pendingAction ===
                    `cancel-payment:${settlementTarget.orderId}` ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner className="text-stone-700" />
                        Cancelling request...
                      </span>
                    ) : (
                      "Cancel payment request"
                    )}
                  </Button>
                </section>
              ) : null}
            </div>
          ) : null}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(cancellationTarget)}
        onOpenChange={(open) => {
          if (pendingAction?.startsWith("cancel-order:")) {
            return;
          }

          if (!open) {
            setCancellationTarget(null);
            setCancellationReason("");
            setApplyCustomerCancellationFee(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancellationHasCollectedPayment
                ? "Collected portions are returned through their original payment methods. Return any cash portion at the counter; Stripe portions are submitted automatically. A manager can apply up to the fee shown to the customer while the order is still pending."
                : "No payment was collected for this bill, so cancelling it does not require a refund."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancellationTarget ? (
            <div className="grid gap-4">
              {cancellationHasCollectedPayment ? (
                <>
                  {orders.canManageRefunds &&
                  cancellationTarget.status === "PENDING" ? (
                    <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
                      <Checkbox
                        checked={applyCustomerCancellationFee}
                        disabled={Boolean(pendingAction)}
                        onCheckedChange={(checked) =>
                          setApplyCustomerCancellationFee(checked === true)
                        }
                      />
                      <span className="text-sm font-medium text-stone-900">
                        Customer-requested cancellation
                      </span>
                    </label>
                  ) : null}
                  {applyCustomerCancellationFee ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-stone-700">
                        Cancellation fee (%)
                      </p>
                      <Input
                        type="number"
                        min="0"
                        max={cancellationTarget.customerCancellationFeeBps / 100}
                        step="0.01"
                        value={cancellationFeePercent}
                        disabled={Boolean(pendingAction)}
                        onChange={(event) =>
                          setCancellationFeePercent(event.target.valueAsNumber)
                        }
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-2 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-600">Collected</span>
                      <span className="font-semibold text-stone-950">
                        {formatMoney(
                          Number(cancellationTarget.paymentCollectedAmount),
                          cancellationTarget.paymentCurrency ?? orders.currency,
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-stone-600">Cancellation fee</span>
                      <span className="font-semibold text-stone-950">
                        {formatMoney(
                          Number(cancellationFinancials?.feeAmount ?? 0),
                          cancellationTarget.paymentCurrency ?? orders.currency,
                        )}
                      </span>
                    </div>
                    {cashReturnMinor > 0 ? (
                      <div className="flex items-center justify-between gap-4 border-t border-stone-200 pt-2">
                        <span className="text-stone-600">Cash to return</span>
                        <span className="font-semibold text-stone-950">
                          {formatMoney(
                            Number(
                              minorUnitsToDecimal(
                                cashReturnMinor,
                                cancellationTarget.paymentCurrency ??
                                  orders.currency,
                              ),
                            ),
                            cancellationTarget.paymentCurrency ?? orders.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {stripeRefundMinor > 0 ? (
                      <div className="flex items-center justify-between gap-4 border-t border-stone-200 pt-2">
                        <span className="text-stone-600">Stripe refund</span>
                        <span className="font-semibold text-stone-950">
                          {formatMoney(
                            Number(
                              minorUnitsToDecimal(
                                stripeRefundMinor,
                                cancellationTarget.paymentCurrency ??
                                  orders.currency,
                              ),
                            ),
                            cancellationTarget.paymentCurrency ?? orders.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-4 border-t border-stone-200 pt-2">
                      <span className="text-stone-600">Total return</span>
                      <span className="font-semibold text-stone-950">
                        {formatMoney(
                          Number(cancellationFinancials?.refundAmount ?? 0),
                          cancellationTarget.paymentCurrency ?? orders.currency,
                        )}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">
                  Cancellation reason
                </p>
                <Textarea
                  value={cancellationReason}
                  disabled={Boolean(pendingAction)}
                  maxLength={200}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  placeholder="Optional reason"
                />
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>
              Keep Order
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                !cancellationTarget ||
                Boolean(pendingAction) ||
                (applyCustomerCancellationFee &&
                  (!Number.isFinite(cancellationFeePercent) ||
                    cancellationFeePercent < 0 ||
                    cancellationFeePercent >
                      (cancellationTarget?.customerCancellationFeeBps ?? 0) /
                        100 ||
                    (cancellationFeeBps <
                      (cancellationTarget?.customerCancellationFeeBps ?? 0) &&
                      cancellationReason.trim().length < 3)))
              }
              onClick={(event) => {
                event.preventDefault();
                void cancelSelectedOrder();
              }}
            >
              {pendingAction?.startsWith("cancel-order:") ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Cancelling...
                </span>
              ) : (
                cancellationHasCollectedPayment
                  ? "Cancel and settle refund"
                  : "Cancel order"
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
