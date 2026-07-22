import { redirect } from "next/navigation";

import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffNewPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access } = await requireRestaurantWorkspaceAccess({
    destination: "staffInvite",
    requiredPermission: "staff.manage",
    restaurantSlug,
  });

  redirect(getRestaurantWorkspaceHref(access.restaurant.slug, "staffInvite"));
}

