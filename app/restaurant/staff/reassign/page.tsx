import { redirect } from "next/navigation";

import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RestaurantStaffReassignPage(
  props: PageProps<"/restaurant/staff/reassign">,
) {
  const { access } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "staffReassign",
  });
  const searchParams = await props.searchParams;
  const identifier = getSearchParam(searchParams.identifier);
  const href = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "staffReassign",
  );

  redirect(
    identifier ? `${href}?identifier=${encodeURIComponent(identifier)}` : href,
  );
}
