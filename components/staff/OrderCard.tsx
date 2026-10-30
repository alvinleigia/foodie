"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BanknoteIcon,
  BadgePercentIcon,
  BikeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CirclePlayIcon,
  ClockIcon,
  CookingPotIcon,
  CreditCardIcon,
  MailIcon,
  MapPinIcon,
  MegaphoneIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  ShoppingBagIcon,
  UtensilsIcon,
  XIcon,
} from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { OrderLineItemRow } from "@/components/shared/OrderLineItemRow";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  OrderItemStatus,
  OrderPaymentMethod,
  OrderStatus,
  PaymentStatus,
} from "@/lib/constants";
import {
  orderCorrectionTargets,
  orderItemCorrectionTargets,
} from "@/lib/order-corrections";
import { formatOrderDisplay } from "@/lib/order-display";
import {
  getOrderFulfilmentLabel,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";
import {
  formatOrderFulfilmentTime,
  getEffectiveFulfilmentTime,
} from "@/lib/order-fulfilment-time";
import {
  staffOrderAdjustmentReasonLabels,
  type StaffOrderAdjustmentReasonCode,
} from "@/lib/order-adjustments";
import {
  canAppendToDineInCheck,
  isOpenDineInCheck,
} from "@/lib/dine-in-checks";
import { getStaffRestaurantAddItemsHref } from "@/lib/staff-restaurant-navigation";

export type StaffOrder = {
  orderId: string;
  orderNo: number;
  orderDate?: string | null;
  customerName: string;
  source: "CUSTOMER_SELF_SERVICE" | "STAFF_CREATED";
  fulfilmentType: OrderFulfilmentType;
  deliveryAddress: {
    line1: string;
    line2: string | null;
    city: string;
    postalCode: string;
    instructions: string | null;
  } | null;
  requestedFulfilmentAt: string | null;
  promisedFulfilmentAt: string | null;
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
    taxRateBpsSnapshot: number;
    taxableAmountSnapshot: string | null;
    taxAmountSnapshot: string | null;
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
  status:
    | "PENDING"
    | "PREPARING"
    | "ASSEMBLING"
    | "READY"
    | "DELIVERED"
    | "CANCELLED";
  createdAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: OrderPaymentMethod | null;
  paymentAmount: string | null;
  paymentCollectedAmount: string;
  paymentCurrency: string | null;
  paymentPortions: Array<{
    amount: string;
    method: OrderPaymentMethod;
  }>;
  adjustment: {
    amount: string;
    calculation: "FIXED_AMOUNT" | "PERCENTAGE";
    id: string;
    note: string | null;
    rateBps: number | null;
    reasonCode: string | null;
    type: "DISCOUNT" | "COMP";
  } | null;
  discountAmountSnapshot: string | null;
  customerCancellationFeeBps: number;
  cancellationFeeBpsApplied: number | null;
  cancellationFeeAmount: string | null;
  refundAmount: string | null;
  receiptNumber: number | null;
  receiptIssuedAt: string | null;
};

export type StaffOrderItem = NonNullable<StaffOrder["items"]>[number];

type OrderCardProps = {
  currency: string;
  order: StaffOrder;
  restaurantSlug: string;
  onItemAction: (
    orderId: string,
    itemId: string,
    action: "start" | "ready" | "deliver" | "cancel",
  ) => Promise<void>;
  onItemAnnounce: (
    orderId: string,
    itemId: string,
    customerName: string,
    drinkName: string,
  ) => Promise<void>;
  onOrderAnnounce: (
    orderId: string,
    customerName: string,
  ) => Promise<void>;
  onOrderAction: (
    orderId: string,
    action: "start" | "ready" | "deliver" | "cancel",
  ) => Promise<void>;
  onCorrectOrder: (order: StaffOrder) => void;
  onCorrectItem: (order: StaffOrder, item: StaffOrderItem) => void;
  onSettleOrder: (order: StaffOrder) => void;
  onSetPromisedTime: (order: StaffOrder) => void;
  onAdjustOrder: (order: StaffOrder) => void;
  onCancelPayment: (order: StaffOrder) => Promise<void>;
  onEmailReceipt: (order: StaffOrder) => Promise<void>;
  canCorrectStatuses: boolean;
  canCreateOrders: boolean;
  canManageRefunds: boolean;
  canSettleBills: boolean;
  onRetryRefund: (order: StaffOrder) => Promise<void>;
  pendingAction: string | null;
  disabled: boolean;
};

export function OrderCard({
  currency,
  order,
  restaurantSlug,
  onItemAction,
  onItemAnnounce,
  onOrderAnnounce,
  onOrderAction,
  onCorrectOrder,
  onCorrectItem,
  onSettleOrder,
  onSetPromisedTime,
  onAdjustOrder,
  onCancelPayment,
  onEmailReceipt,
  canCorrectStatuses,
  canCreateOrders,
  canManageRefunds,
  canSettleBills,
  onRetryRefund,
  pendingAction,
  disabled,
}: OrderCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const openDineInCheck = isOpenDineInCheck(order);
  const canAddItems = canCreateOrders && canAppendToDineInCheck(order);
  const closedAt = openDineInCheck
    ? null
    : order.deliveredAt ?? order.cancelledAt;
  const orderDisplay = formatOrderDisplay(order);
  const itemCount =
    order.itemCount ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1;
  const placedTime = new Date(order.createdAt).toLocaleTimeString();
  const fulfilmentTime = getEffectiveFulfilmentTime(order);
  const canCorrectOrder =
    canCorrectStatuses &&
    ![
      "REFUND_PENDING",
      "PARTIALLY_REFUNDED",
      "REFUND_FAILED",
      "REFUNDED",
    ].includes(order.paymentStatus) &&
    orderCorrectionTargets[order.status as OrderStatus].length > 0;
  const canRetryRefund =
    canManageRefunds &&
    order.status === "CANCELLED" &&
    order.paymentStatus === "REFUND_FAILED";
  const canAdjustOrder =
    order.source === "STAFF_CREATED" &&
    ["PENDING", "PREPARING", "ASSEMBLING", "READY"].includes(order.status) &&
    ["UNPAID", "NOT_REQUIRED"].includes(order.paymentStatus) &&
    Number(order.paymentCollectedAmount) === 0;
  const paymentCurrency = order.paymentCurrency ?? currency;
  const paymentTotal = order.paymentAmount
    ? new Intl.NumberFormat(undefined, {
        currency: paymentCurrency,
        style: "currency",
      }).format(Number(order.paymentAmount))
    : "Price unavailable";
  const paymentCollected = new Intl.NumberFormat(undefined, {
    currency: paymentCurrency,
    style: "currency",
  }).format(Number(order.paymentCollectedAmount));
  const paymentRemaining = order.paymentAmount
    ? new Intl.NumberFormat(undefined, {
        currency: paymentCurrency,
        style: "currency",
      }).format(
        Math.max(
          Number(order.paymentAmount) - Number(order.paymentCollectedAmount),
          0,
        ),
      )
    : "Price unavailable";
  const refundMessage =
    order.status !== "CANCELLED" || order.paymentStatus === "NOT_REQUIRED"
      ? null
      : order.paymentStatus === "REFUND_PENDING"
        ? "Refund is being processed."
        : order.paymentStatus === "REFUNDED"
          ? `Full refund: ${new Intl.NumberFormat(undefined, {
              currency: paymentCurrency,
              style: "currency",
            }).format(Number(order.refundAmount ?? order.paymentAmount ?? 0))}`
          : order.paymentStatus === "PARTIALLY_REFUNDED"
            ? `Refunded ${new Intl.NumberFormat(undefined, {
                currency: paymentCurrency,
                style: "currency",
              }).format(Number(order.refundAmount ?? 0))}; retained ${new Intl.NumberFormat(undefined, {
                currency: paymentCurrency,
                style: "currency",
              }).format(Number(order.cancellationFeeAmount ?? 0))}.`
            : order.paymentStatus === "REFUND_FAILED"
              ? "Refund failed and needs manager attention."
              : (order.paymentStatus === "PAID" ||
                    order.paymentStatus === "PARTIALLY_PAID") &&
                  Number(order.cancellationFeeAmount ?? 0) > 0
                ? `No refund due; ${new Intl.NumberFormat(undefined, {
                    currency: paymentCurrency,
                    style: "currency",
                  }).format(Number(order.cancellationFeeAmount))} was retained.`
                : null;

  const paymentStateLabel: Record<PaymentStatus, string> = {
    NOT_REQUIRED: "No payment",
    UNPAID: "Unpaid",
    PARTIALLY_PAID: "Part paid",
    PENDING: "Pending",
    PAID: "Paid",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    REFUND_PENDING: "Refund pending",
    PARTIALLY_REFUNDED: "Part refunded",
    REFUND_FAILED: "Refund issue",
    REFUNDED: "Refunded",
  };
  const paymentStateClass =
    order.paymentStatus === "PAID"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      : order.paymentStatus === "UNPAID" ||
          order.paymentStatus === "PARTIALLY_PAID" ||
          order.paymentStatus === "PENDING"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : order.paymentStatus === "FAILED" ||
            order.paymentStatus === "REFUND_FAILED"
          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
          : "bg-muted text-muted-foreground";
  const FulfilmentIcon =
    order.fulfilmentType === "DINE_IN"
      ? UtensilsIcon
      : order.fulfilmentType === "PICKUP"
        ? ShoppingBagIcon
        : BikeIcon;
  const summaryStatusAction: {
    action: "start" | "ready" | "deliver";
    className: string;
    Icon: typeof CookingPotIcon;
    label: string;
    pendingLabel: string;
  } | null = openDineInCheck
    ? null
    : order.status === "PENDING"
      ? {
          action: "start",
          className:
            "border-border bg-background text-foreground hover:bg-muted",
          Icon: CookingPotIcon,
          label: "Start order",
          pendingLabel: "Starting...",
        }
      : order.status === "PREPARING"
        ? {
            action: "ready",
            className: "bg-amber-500 text-stone-950 hover:bg-amber-400",
            Icon: CirclePlayIcon,
            label: "Send to assembly",
            pendingLabel: "Sending...",
          }
        : order.status === "ASSEMBLING"
          ? {
              action: "ready",
              className: "bg-emerald-600 text-white hover:bg-emerald-500",
              Icon: CheckCircleIcon,
              label: "Ready for handoff",
              pendingLabel: "Releasing...",
            }
          : order.status === "READY"
            ? {
                action: "deliver",
                className: "bg-emerald-600 text-white hover:bg-emerald-500",
                Icon: CheckCircleIcon,
                label: "Mark delivered",
                pendingLabel: "Delivering...",
              }
            : null;

  function renderSummaryPrimaryAction() {
    if (canRetryRefund) {
      return (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onRetryRefund(order)}
          data-slot="order-primary-action"
          className="h-10 w-full border-amber-300 bg-background text-amber-800 hover:bg-amber-50 hover:text-amber-900 sm:w-auto dark:text-amber-300 dark:hover:bg-amber-400/10"
        >
          {pendingAction === `refund-order:${order.orderId}` ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="text-amber-800" />
              Retrying...
            </span>
          ) : (
            <ButtonLabel icon={RefreshCwIcon}>Retry refund</ButtonLabel>
          )}
        </Button>
      );
    }

    if (openDineInCheck && canAddItems) {
      return (
        <Button asChild variant="outline" data-slot="order-primary-action" className="h-10 w-full sm:w-auto">
          <Link
            href={getStaffRestaurantAddItemsHref(
              restaurantSlug,
              order.orderId,
            )}
          >
            <ButtonLabel icon={PlusIcon}>Add items</ButtonLabel>
          </Link>
        </Button>
      );
    }

    if (summaryStatusAction) {
      const SummaryActionIcon = summaryStatusAction.Icon;
      const actionKey = `${summaryStatusAction.action}-order:${order.orderId}`;

      return (
        <Button
          type="button"
          variant={summaryStatusAction.action === "start" ? "outline" : "default"}
          disabled={disabled}
          data-slot="order-primary-action"
          onClick={() =>
            onOrderAction(order.orderId, summaryStatusAction.action)
          }
          className={`h-10 w-full sm:w-auto ${summaryStatusAction.className}`}
        >
          {pendingAction === actionKey ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              {summaryStatusAction.pendingLabel}
            </span>
          ) : (
            <ButtonLabel icon={SummaryActionIcon}>
              {summaryStatusAction.label}
            </ButtonLabel>
          )}
        </Button>
      );
    }

    if (
      canSettleBills &&
      order.source === "STAFF_CREATED" &&
      (order.paymentStatus === "UNPAID" ||
        order.paymentStatus === "PARTIALLY_PAID")
    ) {
      return (
        <Button
          type="button"
          disabled={disabled || !order.paymentAmount}
          data-slot="order-primary-action"
          onClick={() => onSettleOrder(order)}
          className="h-10 w-full bg-stone-950 text-white hover:bg-stone-800 sm:w-auto"
        >
          <ButtonLabel icon={BanknoteIcon}>
            {order.paymentStatus === "PARTIALLY_PAID"
              ? "Collect balance"
              : "Settle bill"}
          </ButtonLabel>
        </Button>
      );
    }

    return null;
  }

  function renderOrderActions() {
    if (
      !canCorrectOrder &&
      (order.status === "DELIVERED" || order.status === "CANCELLED")
    ) {
      return null;
    }

    return (
      <div className="mt-5 border-t border-stone-200 pt-4">
        <p className="text-sm font-semibold text-stone-800">
          Order actions
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {openDineInCheck && order.status === "PENDING" ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onOrderAction(order.orderId, "start")}
              className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
            >
              {pendingAction === `start-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-700" />
                  Starting...
                </span>
              ) : (
                <ButtonLabel icon={CookingPotIcon}>Start whole order</ButtonLabel>
              )}
            </Button>
          ) : null}

          {openDineInCheck && order.status === "PREPARING" ? (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onOrderAction(order.orderId, "ready")}
              className="rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
            >
              {pendingAction === `ready-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-950" />
                  Sending to assembly...
                </span>
              ) : (
                <ButtonLabel icon={CirclePlayIcon}>Send to final assembly</ButtonLabel>
              )}
            </Button>
          ) : null}

          {openDineInCheck && order.status === "ASSEMBLING" ? (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onOrderAction(order.orderId, "ready")}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {pendingAction === `ready-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Releasing...
                </span>
              ) : (
                <ButtonLabel icon={CheckCircleIcon}>Ready for handoff</ButtonLabel>
              )}
            </Button>
          ) : null}

          {order.status === "READY" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onOrderAnnounce(order.orderId, order.customerName)}
                className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
              >
                {pendingAction === `announce-order:${order.orderId}` ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-stone-700" />
                    Playing...
                  </span>
                ) : (
                  <ButtonLabel icon={MegaphoneIcon}>Play all messages</ButtonLabel>
                )}
              </Button>
              {openDineInCheck ? (
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => onOrderAction(order.orderId, "deliver")}
                  className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {pendingAction === `deliver-order:${order.orderId}` ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="text-white" />
                      Delivering...
                    </span>
                  ) : (
                    <ButtonLabel icon={CheckCircleIcon}>
                      Mark whole order delivered
                    </ButtonLabel>
                  )}
                </Button>
              ) : null}
            </>
          ) : null}

          {(order.status === "PENDING" ||
          order.status === "PREPARING" ||
          order.status === "ASSEMBLING" ||
          order.status === "READY") && order.paymentStatus !== "PENDING" ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onOrderAction(order.orderId, "cancel")}
              className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            >
              {pendingAction === `cancel-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Cancelling...
                </span>
              ) : (
                <ButtonLabel icon={XIcon}>Cancel whole order</ButtonLabel>
              )}
            </Button>
          ) : null}

          {order.status === "PENDING" ||
          order.status === "PREPARING" ||
          order.status === "ASSEMBLING" ||
          order.status === "READY" ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onSetPromisedTime(order)}
              className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
            >
              <ButtonLabel icon={ClockIcon}>
                {order.promisedFulfilmentAt ? "Change promised time" : "Set promised time"}
              </ButtonLabel>
            </Button>
          ) : null}

          {canCorrectOrder ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onCorrectOrder(order)}
              className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
            >
              {pendingAction === `correct-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-700" />
                  Correcting...
                </span>
              ) : (
                <ButtonLabel icon={RotateCcwIcon}>Correct status</ButtonLabel>
              )}
            </Button>
          ) : null}

          {canAdjustOrder ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onAdjustOrder(order)}
              className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
            >
              <ButtonLabel icon={BadgePercentIcon}>
                {order.adjustment ? "Edit discount / comp" : "Discount / comp"}
              </ButtonLabel>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderItemActions(item: StaffOrderItem) {
    const canUpdateItem =
      Boolean(item.id) && item.status !== "DELIVERED" && item.status !== "CANCELLED";
    const canCorrectItem =
      canCorrectStatuses &&
      order.cancellationFeeBpsApplied === null &&
      Boolean(item.id) &&
      orderItemCorrectionTargets[item.status].length > 0;

    if (!canUpdateItem && !canCorrectItem) {
      return null;
    }

    return (
      <>
        {canUpdateItem && (item.status === "PENDING" || item.status === "PREPARING") ? (
          <Button
            type="button"
            variant={item.status === "PREPARING" ? "default" : "outline"}
            disabled={disabled}
            onClick={() =>
              onItemAction(
                order.orderId,
                item.id!,
                item.status === "PENDING" ? "start" : "ready",
              )
            }
            className={
              item.status === "PREPARING"
                ? "w-full rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
                : "w-full rounded-lg border-border bg-background text-foreground hover:bg-muted"
            }
          >
            {pendingAction ===
            `${item.status === "PENDING" ? "start" : "ready"}-item:${item.id}` ? (
              <span className="inline-flex items-center gap-2">
                <Spinner
                  className={
                    item.status === "PREPARING" ? "text-stone-950" : "text-stone-700"
                  }
                />
                {item.status === "PENDING" ? "Starting..." : "Marking Ready..."}
              </span>
            ) : item.status === "PENDING" ? (
              <ButtonLabel icon={CookingPotIcon}>Start Preparing</ButtonLabel>
            ) : (
              <ButtonLabel icon={CirclePlayIcon}>Mark Ready</ButtonLabel>
            )}
          </Button>
        ) : null}

        {canUpdateItem && item.status === "READY" && order.status === "READY" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onItemAnnounce(
                  order.orderId,
                  item.id!,
                  order.customerName,
                  item.drinkName,
                )
              }
              className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
            >
              {pendingAction === `announce-item:${item.id}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-700" />
                  Playing...
                </span>
              ) : (
                <ButtonLabel icon={MegaphoneIcon}>Play Message</ButtonLabel>
              )}
            </Button>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onItemAction(order.orderId, item.id!, "deliver")}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {pendingAction === `deliver-item:${item.id}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Delivering...
                </span>
              ) : (
                <ButtonLabel icon={CheckCircleIcon}>Mark Delivered</ButtonLabel>
              )}
            </Button>
          </>
        ) : null}

        {canUpdateItem &&
        (order.paymentStatus === "NOT_REQUIRED" ||
          order.paymentStatus === "UNPAID") ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onItemAction(order.orderId, item.id!, "cancel")}
            className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-700"
          >
            {pendingAction === `cancel-item:${item.id}` ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-rose-700" />
                Cancelling...
              </span>
            ) : (
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
            )}
          </Button>
        ) : null}

        {canCorrectItem ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onCorrectItem(order, item)}
            className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
          >
            {pendingAction === `correct-item:${item.id}` ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-stone-700" />
                Correcting...
              </span>
            ) : (
              <ButtonLabel icon={RotateCcwIcon}>Correct status</ButtonLabel>
            )}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Card tone="themed" className="rounded-xl border-border bg-card shadow-[0_14px_40px_rgba(40,26,20,0.08)]">
      <CardHeader className="p-4">
        <div
          data-slot="order-summary"
          className="rounded-lg bg-muted/35 p-4 transition-colors hover:bg-muted/55"
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate text-lg font-semibold text-foreground">
                  {orderDisplay.label} <span aria-hidden="true">&middot;</span>{" "}
                  {order.customerName}
                </h3>
                <OrderStatusBadge status={order.status} className="px-2 py-1 tracking-normal" />
                {openDineInCheck ? (
                  <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                    Open check
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {[orderDisplay.meta, order.drinkName].filter(Boolean).join(" / ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-medium text-foreground ring-1 ring-border">
                  <FulfilmentIcon className="size-3.5" aria-hidden="true" />
                  {getOrderFulfilmentLabel(order.fulfilmentType)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <PackageIcon className="size-3.5" aria-hidden="true" />
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  Placed {placedTime}
                </span>
                <span>
                  {fulfilmentTime
                    ? `${fulfilmentTime.label} ${formatOrderFulfilmentTime(fulfilmentTime.at)}`
                    : "ASAP"}
                </span>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
              <p className="text-lg font-semibold text-foreground">{paymentTotal}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStateClass}`}>
                {paymentStateLabel[order.paymentStatus]}
              </span>
            </div>
          </div>

          <div
            data-slot="order-summary-controls"
            className="mt-4 flex flex-wrap items-center justify-between gap-2"
          >
            <div>{renderSummaryPrimaryAction()}</div>
            <button
              type="button"
              aria-controls={`order-details-${order.orderId}`}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Show order details" : "Hide order details"}
              data-slot="order-details-toggle"
              className="flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-amber-500/30"
              onClick={() => setIsCollapsed((current) => !current)}
            >
              {isCollapsed ? (
                <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronUpIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              Details
            </button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed ? (
      <CardContent
        className="border-t border-border px-5 pt-4 pb-5"
        id={`order-details-${order.orderId}`}
      >
        {openDineInCheck ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div>
              <p className="text-sm font-semibold text-emerald-950">
                Dine-in check remains open
              </p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Add items as the guest orders, then settle the complete bill at the end.
              </p>
            </div>
            {canAddItems ? (
              <Button asChild className="bg-stone-950 text-white hover:bg-stone-800">
                <Link
                  href={getStaffRestaurantAddItemsHref(
                    restaurantSlug,
                    order.orderId,
                  )}
                >
                  <ButtonLabel icon={PlusIcon}>Add items</ButtonLabel>
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {order.fulfilmentType === "DELIVERY" && order.deliveryAddress ? (
          <div className="mb-4 flex gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-stone-500" />
            <div>
              <p className="font-semibold text-stone-900">Delivery address</p>
              <p>
                {[
                  order.deliveryAddress.line1,
                  order.deliveryAddress.line2,
                  order.deliveryAddress.city,
                  order.deliveryAddress.postalCode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {order.deliveryAddress.instructions ? (
                <p className="mt-1 text-stone-600">
                  {order.deliveryAddress.instructions}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {order.items?.length ? (
          <section className="mt-2 border-y border-border py-4" aria-labelledby={`order-items-${order.orderId}`}>
            <div className="flex items-center justify-between gap-3">
              <h4 id={`order-items-${order.orderId}`} className="text-base font-semibold text-foreground">
                Order details
              </h4>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="mt-2 divide-y divide-border">
              {order.items.map((item) => (
                <OrderLineItemRow
                  key={item.id ?? `${order.orderId}-${item.drinkId}`}
                  categoryName={item.categoryName}
                  className="rounded-none border-0 bg-transparent px-0 py-4"
                  drinkName={item.drinkName}
                  notes={item.notes}
                  quantity={item.quantity}
                  status={item.status}
                  currency={currency}
                  unitPrice={item.unitPrice}
                  modifiers={item.modifiers}
                  actions={renderItemActions(item)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {closedAt ? (
          <p className="mt-2 text-sm text-stone-500">
            {order.status === "DELIVERED" ? "Delivered" : "Cancelled"}{" "}
            {new Date(closedAt).toLocaleTimeString()}
          </p>
        ) : null}

        {refundMessage ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-sm font-medium ${
              order.paymentStatus === "REFUND_FAILED"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : order.paymentStatus === "REFUND_PENDING"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {refundMessage}
          </p>
        ) : null}

        {order.receiptNumber ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 py-3">
            <div>
              <p className="text-sm font-semibold text-stone-900">Receipt available</p>
              <p className="mt-0.5 text-xs text-stone-500">
                View or print the finalized payment receipt.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  href={`/restaurants/${encodeURIComponent(restaurantSlug)}/orders/${encodeURIComponent(order.orderId)}/receipt`}
                >
                  <ButtonLabel icon={ReceiptTextIcon}>View receipt</ButtonLabel>
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onEmailReceipt(order)}
              >
                {pendingAction === `email-receipt:${order.orderId}` ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-stone-700" />
                    Sending...
                  </span>
                ) : (
                  <ButtonLabel icon={MailIcon}>Email receipt</ButtonLabel>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {order.adjustment ? (
          <div className="mt-4 flex items-center justify-between gap-4 border-y border-emerald-200 px-1 py-3 text-emerald-950">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                <BadgePercentIcon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {order.adjustment.type === "COMP" ? "Bill comped" : "Discount applied"}
                </p>
                <p className="mt-0.5 text-xs opacity-75">
                  {staffOrderAdjustmentReasonLabels[
                    order.adjustment.reasonCode as StaffOrderAdjustmentReasonCode
                  ] ?? order.adjustment.reasonCode ?? "Adjustment"}
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold">
              {order.adjustment.type === "COMP"
                ? "Full bill"
                : order.adjustment.calculation === "PERCENTAGE" &&
                    order.adjustment.rateBps
                  ? `${order.adjustment.rateBps / 100}%`
                  : `-${new Intl.NumberFormat(undefined, {
                      currency: paymentCurrency,
                      style: "currency",
                    }).format(Number(order.adjustment.amount))}`}
            </span>
          </div>
        ) : null}

        {order.source === "STAFF_CREATED" &&
        order.status !== "CANCELLED" &&
        (order.paymentStatus === "UNPAID" ||
          order.paymentStatus === "PARTIALLY_PAID" ||
          order.paymentStatus === "PENDING" ||
          order.paymentStatus === "PAID") ? (
          <div
            className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-y px-1 py-3 ${
              order.paymentStatus === "PAID"
                ? "border-emerald-200 text-emerald-900"
                : order.paymentStatus === "PENDING"
                  ? "border-sky-200 text-sky-950"
                  : "border-amber-200 text-amber-950"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                  order.paymentStatus === "PAID"
                    ? "bg-emerald-100 text-emerald-700"
                    : order.paymentStatus === "PENDING"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {order.paymentMethod === "CASH" ? (
                  <BanknoteIcon className="size-4" />
                ) : (
                  <CreditCardIcon className="size-4" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {order.paymentStatus === "PAID"
                    ? order.paymentMethod === "CASH"
                      ? "Paid in cash"
                      : "Paid online"
                    : order.paymentStatus === "PENDING"
                      ? "Online payment requested"
                      : order.paymentStatus === "PARTIALLY_PAID"
                        ? "Partially paid"
                      : "Bill unpaid"}
                </p>
                <p className="mt-0.5 text-xs opacity-75">
                  {order.paymentStatus === "PARTIALLY_PAID" ||
                  order.paymentStatus === "PENDING"
                    ? `${paymentCollected} collected; ${paymentRemaining} remaining`
                    : paymentTotal}
                </p>
              </div>
            </div>

            {canSettleBills &&
            (order.paymentStatus === "UNPAID" ||
              order.paymentStatus === "PARTIALLY_PAID") ? (
              <Button
                type="button"
                disabled={disabled || !order.paymentAmount}
                onClick={() => onSettleOrder(order)}
                className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
              >
                {order.paymentStatus === "PARTIALLY_PAID"
                  ? "Collect balance"
                  : "Settle bill"}
              </Button>
            ) : order.paymentStatus === "PENDING" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onSettleOrder(order)}
                  className="rounded-lg border-sky-200 bg-white text-sky-900 hover:bg-sky-50"
                >
                  View payment link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onCancelPayment(order)}
                  className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
                >
                  {pendingAction === `cancel-payment:${order.orderId}` ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="text-stone-700" />
                      Cancelling...
                    </span>
                  ) : (
                    "Cancel payment request"
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {renderOrderActions()}
      </CardContent>
      ) : null}
    </Card>
  );
}
