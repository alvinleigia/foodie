"use client";

import {
  BikeIcon,
  ShoppingBagIcon,
  StoreIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react";

import {
  orderFulfilmentDescriptions,
  orderFulfilmentLabels,
  orderFulfilmentTypes,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";

const fulfilmentIcons: Record<OrderFulfilmentType, LucideIcon> = {
  DINE_IN: UtensilsIcon,
  TAKEAWAY: ShoppingBagIcon,
  COLLECTION: StoreIcon,
  DELIVERY: BikeIcon,
};

export function FulfilmentTypeSelector({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: OrderFulfilmentType) => void;
  value: OrderFulfilmentType;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-stone-950">
        How should this order be fulfilled?
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {orderFulfilmentTypes.map((type) => {
          const Icon = fulfilmentIcons[type];
          const selected = value === type;

          return (
            <label
              key={type}
              className={`grid min-h-24 content-start gap-2 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-stone-500 has-focus-visible:ring-offset-2 ${
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
              <span>
                <span className="block text-sm font-semibold">
                  {orderFulfilmentLabels[type]}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    selected ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  {orderFulfilmentDescriptions[type]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
