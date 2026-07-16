import { redirect } from "next/navigation";

import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { getRestaurantStaffMemberHref } from "@/lib/restaurant-workspace";

export default async function RestaurantStaffAccessPage(
  props: PageProps<"/restaurant/staff/[membershipId]">,
) {
  const { membershipId } = await props.params;
  const { access } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "staff",
  });

  redirect(getRestaurantStaffMemberHref(access.restaurant.slug, membershipId));
}
