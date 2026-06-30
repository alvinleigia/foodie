"use client";

import {
  CheckCircleIcon,
  CirclePlayIcon,
  CookingPotIcon,
  MegaphoneIcon,
  XIcon,
} from "lucide-react";

import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { OrderLineItemRow } from "@/components/shared/OrderLineItemRow";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OrderItemStatus } from "@/lib/constants";
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
  }>;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

type StaffOrderItem = NonNullable<StaffOrder["items"]>[number];

type OrderCardProps = {
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
  pendingAction: string | null;
  disabled: boolean;
};

export function OrderCard({
  order,
  onItemAction,
  onItemAnnounce,
  pendingAction,
  disabled,
}: OrderCardProps) {
  const closedAt = order.deliveredAt ?? order.cancelledAt;
  const orderDisplay = formatOrderDisplay(order);

  function renderItemActions(item: StaffOrderItem) {
    if (!item.id || item.status === "DELIVERED" || item.status === "CANCELLED") {
      return null;
    }

    return (
      <>
        {item.status === "PENDING" || item.status === "PREPARING" ? (
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

        {item.status === "READY" ? (
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
      </>
    );
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white shadow-[0_14px_40px_rgba(40,26,20,0.08)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5 pb-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
            {orderDisplay.label}
            {orderDisplay.meta ? ` · ${orderDisplay.meta}` : ""}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-stone-900">
            {order.customerName}
          </h3>
          <p className="mt-1 text-stone-600">
            {order.drinkName}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {order.itemCount ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1} item(s)
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

        {order.items?.length ? (
          <div className="mt-4 grid gap-2">
            {order.items.map((item) => {
              return (
                <OrderLineItemRow
                  key={item.id ?? `${order.orderId}-${item.drinkId}`}
                  categoryName={item.categoryName}
                  className="bg-stone-50"
                  drinkName={item.drinkName}
                  notes={item.notes}
                  quantity={item.quantity}
                  status={item.status}
                  unitPrice={item.unitPrice}
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
