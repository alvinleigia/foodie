import Image from "next/image";
import { MapPinIcon, StoreIcon, UtensilsCrossedIcon } from "lucide-react";

import { getOrderFulfilmentLabel, type OrderFulfilmentType } from "@/lib/order-fulfilment";
import type { CustomerRestaurantIdentity } from "@/types/menu";

export function CustomerRestaurantHeader({
  restaurant,
  fulfilmentTypes,
}: {
  restaurant?: CustomerRestaurantIdentity | null;
  fulfilmentTypes: OrderFulfilmentType[];
}) {
  const label = restaurant?.orderingPointLabel?.trim();

  return (
    <div>
      <div className="relative h-36 overflow-hidden rounded-xl bg-stone-100 sm:h-52">
        <Image
          src="/images/customer-restaurant-banner.jpg"
          alt=""
          fill
          sizes="(max-width: 1200px) 100vw, 1152px"
          loading="eager"
          fetchPriority="high"
          className="object-cover"
        />
      </div>
      <div className="flex items-start gap-3 pt-5">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-teal-100 bg-teal-50 text-teal-700">
          {restaurant?.logoUrl ? (
            <Image
              src={restaurant.logoUrl}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-full object-contain"
            />
          ) : <StoreIcon className="size-6" aria-hidden="true" />}
        </span>
        <div className="min-w-0 space-y-1.5">
          <h1 className="break-words text-2xl font-bold text-stone-950 sm:text-3xl">
            {restaurant?.name ?? "Menu"}
          </h1>
          {label && label.toLocaleLowerCase() !== restaurant?.name.trim().toLocaleLowerCase() ? (
            <p className="flex items-center gap-1.5 text-xs text-stone-500 sm:text-sm">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </p>
          ) : null}
        </div>
      </div>
      {fulfilmentTypes.length > 0 ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-stone-500 sm:text-sm">
          <UtensilsCrossedIcon className="mt-0.5 size-3.5 shrink-0 text-teal-700" aria-hidden="true" />
          <span>{fulfilmentTypes.map(getOrderFulfilmentLabel).join(" · ")}</span>
        </p>
      ) : null}
    </div>
  );
}
