import { ReactNode } from "react";
import { PackageIcon } from "lucide-react";

import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { OrderItemStatus, OrderLineItemModifier } from "@/lib/constants";
import { formatPrice } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type OrderLineItemRowProps = {
  actions?: ReactNode;
  categoryName?: string | null;
  className?: string;
  currency?: string;
  drinkName: string;
  notes?: string | null;
  quantity: number;
  status?: OrderItemStatus;
  unitPrice?: string | null;
  modifiers?: OrderLineItemModifier[];
};

function formatLinePrice(
  unitPrice: string | null | undefined,
  quantity: number,
  currency?: string,
  modifiers: OrderLineItemModifier[] = [],
) {
  const basePrice = unitPrice ? Number(unitPrice) : 0;
  const modifierPrice = modifiers.reduce(
    (sum, modifier) => sum + Number(modifier.priceDelta) * modifier.quantity,
    0,
  );

  if (!unitPrice && modifierPrice === 0) {
    return null;
  }

  return formatPrice((basePrice + modifierPrice) * quantity, { currency });
}

export function OrderLineItemRow({
  actions,
  categoryName,
  className,
  currency,
  drinkName,
  notes,
  quantity,
  status,
  unitPrice,
  modifiers = [],
}: OrderLineItemRowProps) {
  const linePrice = formatLinePrice(unitPrice, quantity, currency, modifiers);

  return (
    <div
      className={cn(
        "rounded-lg border border-stone-200 bg-white px-3 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
            <PackageIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-stone-900">
                {drinkName}
              </p>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                x{quantity}
              </span>
            </div>
            {categoryName ? (
              <p className="mt-1 text-xs text-stone-500">{categoryName}</p>
            ) : null}
            {notes ? (
              <p className="mt-1 text-xs text-stone-500">Note: {notes}</p>
            ) : null}
            {modifiers.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {modifiers.map((modifier) => (
                  <p
                    key={modifier.id ?? `${modifier.modifierGroupId}-${modifier.modifierId}`}
                    className="text-xs text-stone-500"
                  >
                    {modifier.modifierGroupName}: {modifier.modifierName}
                    {modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}
                    {Number(modifier.priceDelta) > 0
                      ? ` + ${formatPrice(modifier.priceDelta, { currency })}`
                      : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {status || linePrice ? (
          <div className="flex flex-col items-end gap-2">
            {status ? <OrderStatusBadge status={status} /> : null}
            {linePrice ? (
              <p className="text-xs font-semibold text-stone-700">{linePrice}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="mt-3 border-t border-dashed border-stone-200 pt-3">
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
