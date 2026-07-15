import Link from "next/link";
import { ChevronRightIcon, StoreIcon } from "lucide-react";

type RestaurantPickerProps = {
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
};

export function RestaurantPicker({ restaurants }: RestaurantPickerProps) {
  return (
    <section className="overflow-hidden rounded-lg bg-stone-100 text-stone-950 shadow-xl">
      <div className="border-b border-stone-200 px-6 py-6 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
          Restaurants
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Choose a restaurant</h1>
      </div>
      <div className="divide-y divide-stone-200">
        {restaurants.map((restaurant) => (
          <Link
            key={restaurant.id}
            href={`/order/${restaurant.slug}`}
            className="flex min-h-16 items-center gap-4 px-6 py-4 transition-colors hover:bg-white sm:px-8"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white">
              <StoreIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1 font-semibold">{restaurant.name}</span>
            <ChevronRightIcon className="size-5 shrink-0 text-stone-500" />
          </Link>
        ))}
      </div>
    </section>
  );
}
