"use client";

import {
  CheckCircleIcon,
  CirclePlayIcon,
  ClockIcon,
  CookingPotIcon,
  MegaphoneIcon,
  PackageIcon,
  RotateCcwIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { OrderLineItemRow } from "@/components/shared/OrderLineItemRow";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OrderItemStatus, OrderStatus } from "@/lib/constants";
import {
  orderCorrectionTargets,
  orderItemCorrectionTargets,
} from "@/lib/order-corrections";
import { formatOrderDisplay } from "@/lib/order-display";

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

type StaffOrderItem = NonNullable<StaffOrder["items"]>[number];

type OrderCardProps = {
  currency: string;
  order: StaffOrder;
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
  canCorrectStatuses: boolean;
  pendingAction: string | null;
  disabled: boolean;
};

export function OrderCard({
  currency,
  order,
  onItemAction,
  onItemAnnounce,
  onOrderAnnounce,
  onOrderAction,
  onCorrectOrder,
  onCorrectItem,
  canCorrectStatuses,
  pendingAction,
  disabled,
}: OrderCardProps) {
  const closedAt = order.deliveredAt ?? order.cancelledAt;
  const orderDisplay = formatOrderDisplay(order);
  const itemCount =
    order.itemCount ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1;
  const placedTime = new Date(order.createdAt).toLocaleTimeString();
  const canCorrectOrder =
    canCorrectStatuses && orderCorrectionTargets[order.status as OrderStatus].length > 0;

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
          {order.status === "PENDING" ? (
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

          {order.status === "PREPARING" ? (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onOrderAction(order.orderId, "ready")}
              className="rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
            >
              {pendingAction === `ready-order:${order.orderId}` ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-stone-950" />
                  Marking Ready...
                </span>
              ) : (
                <ButtonLabel icon={CirclePlayIcon}>Mark whole order ready</ButtonLabel>
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
            </>
          ) : null}

          {order.status === "PENDING" || order.status === "READY" ? (
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
        </div>
      </div>
    );
  }

  function renderItemActions(item: StaffOrderItem) {
    const canUpdateItem =
      Boolean(item.id) && item.status !== "DELIVERED" && item.status !== "CANCELLED";
    const canCorrectItem =
      canCorrectStatuses &&
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
                ? "rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
                : "rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
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

        {canUpdateItem && item.status === "READY" ? (
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

        {canUpdateItem ? (
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
    <Card className="rounded-xl border-stone-200 bg-white shadow-[0_14px_40px_rgba(40,26,20,0.08)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5 pb-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
            {orderDisplay.label}
          </p>
          {orderDisplay.meta ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              {orderDisplay.meta}
            </p>
          ) : null}
          <div className="mt-3 flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <UserRoundIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-2xl font-semibold text-stone-900">
                {order.customerName}
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                {order.drinkName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">
                  <PackageIcon className="size-3.5" />
                  {itemCount} item(s)
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">
                  <ClockIcon className="size-3.5" />
                  Placed {placedTime}
                </span>
              </div>
            </div>
          </div>
        </div>
        <OrderStatusBadge status={order.status} />
      </CardHeader>

      <CardContent className="px-5 pt-4 pb-5">
        {closedAt ? (
          <p className="mt-2 text-sm text-stone-500">
            {order.status === "DELIVERED" ? "Delivered" : "Cancelled"}{" "}
            {new Date(closedAt).toLocaleTimeString()}
          </p>
        ) : null}

        {renderOrderActions()}

        {order.items?.length ? (
          <div className="mt-5 grid gap-3">
            {order.items.map((item) => {
              return (
                <OrderLineItemRow
                  key={item.id ?? `${order.orderId}-${item.drinkId}`}
                  categoryName={item.categoryName}
                  className="bg-white"
                  drinkName={item.drinkName}
                  notes={item.notes}
                  quantity={item.quantity}
                  status={item.status}
                  currency={currency}
                  unitPrice={item.unitPrice}
                  modifiers={item.modifiers}
                  actions={renderItemActions(item)}
                />
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
