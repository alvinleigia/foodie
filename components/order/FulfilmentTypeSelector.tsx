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
      <div className="mt-3 grid grid-cols-3 gap-2">
        {allowedTypes.map((type) => {
          const Icon = fulfilmentIcons[type];
          const selected = value === type;

          return (
            <label
              key={type}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-stone-500 has-focus-visible:ring-offset-2 ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${
                selected
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-200 bg-white text-stone-900 hover:bg-stone-50"
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
              <Icon className="size-5" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {orderFulfilmentLabels[type]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
