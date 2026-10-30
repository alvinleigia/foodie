"use client";

import {
  BikeIcon,
  ShoppingBagIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react";

import {
  orderFulfilmentLabels,
  orderFulfilmentTypes,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";

const fulfilmentIcons: Record<OrderFulfilmentType, LucideIcon> = {
  DINE_IN: UtensilsIcon,
  PICKUP: ShoppingBagIcon,
  DELIVERY: BikeIcon,
};

export function FulfilmentTypeSelector({
  allowedTypes = orderFulfilmentTypes,
  disabled = false,
  onChange,
  value,
}: {
  allowedTypes?: readonly OrderFulfilmentType[];
  disabled?: boolean;
  onChange: (value: OrderFulfilmentType) => void;
  value: OrderFulfilmentType;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-stone-950">
        Order type
      </legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {allowedTypes.map((type) => {
          const Icon = fulfilmentIcons[type];
          const selected = value === type;

          return (
            <label
              key={type}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-stone-500 has-focus-visible:ring-offset-2 ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${
                selected
                  ? "border-stone-500 bg-stone-200 text-stone-950 shadow-sm dark:border-stone-500 dark:bg-stone-700 dark:text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="fulfilmentType"
                value={type}
                checked={selected}
                onChange={() => onChange(type)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold sm:text-sm">
                {orderFulfilmentLabels[type]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
