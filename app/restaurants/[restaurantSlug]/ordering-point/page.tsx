import { redirect } from "next/navigation";

import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantOrderingPointPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access } = await requireRestaurantWorkspaceAccess({
    destination: "settings",
    requiredPermission: "restaurant.settings",
    restaurantSlug,
  });

  redirect(
    `${getRestaurantWorkspaceHref(access.restaurant.slug, "settings")}#customer-ordering`,
  );
}

