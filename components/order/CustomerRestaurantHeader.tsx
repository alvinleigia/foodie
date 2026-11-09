"use client";

import Image from "next/image";
import { useState } from "react";
import { MapPinIcon, StoreIcon, UtensilsCrossedIcon } from "lucide-react";

import { getOrderFulfilmentLabel, type OrderFulfilmentType } from "@/lib/order-fulfilment";
import type { CustomerRestaurantIdentity } from "@/types/menu";

const defaultFeaturedImage = "/images/customer-restaurant-banner.jpg";

export function CustomerRestaurantHeader({
  restaurant,
  fulfilmentTypes,
}: {
  restaurant?: CustomerRestaurantIdentity | null;
  fulfilmentTypes: OrderFulfilmentType[];
}) {
  const label = restaurant?.orderingPointLabel?.trim();
  const featuredImage = restaurant?.featuredImageUrl?.trim() || defaultFeaturedImage;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageSrc = failedImage === featuredImage ? defaultFeaturedImage : featuredImage;

  return (
    <div>
      <div className="relative h-36 overflow-hidden rounded-xl bg-stone-100 sm:h-52">
        <Image
          key={imageSrc}
          data-slot="restaurant-featured-image"
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 1200px) 100vw, 1152px"
          loading="eager"
          fetchPriority="high"
          unoptimized={imageSrc !== defaultFeaturedImage}
          onError={() => setFailedImage(imageSrc)}
          className="object-cover"
        />
      </div>
      <div className="flex items-center gap-3 pt-5">
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
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-stone-950 sm:text-3xl">
            {restaurant?.name ?? "Menu"}
          </h1>
        </div>
      </div>
      <div data-slot="restaurant-meta" className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-teal-700 [&_svg]:size-4 [&_svg]:shrink-0">
        {label && label.toLocaleLowerCase() !== restaurant?.name.trim().toLocaleLowerCase() ? (
          <p data-slot="restaurant-location" className="inline-flex items-center gap-1.5">
            <MapPinIcon aria-hidden="true" />
            <span>{label}</span>
          </p>
        ) : null}
        {fulfilmentTypes.length > 0 ? (
          <p data-slot="restaurant-fulfilment" className="inline-flex items-center gap-1.5">
            <UtensilsCrossedIcon aria-hidden="true" />
            <span>{fulfilmentTypes.map(getOrderFulfilmentLabel).join(" · ")}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
