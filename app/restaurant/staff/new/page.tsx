import { restaurantAdminRoles } from "@/lib/role-access";
import { redirectToActiveRestaurantWorkspace } from "@/lib/restaurant-workspace-access";

export default async function RestaurantStaffNewPage() {
  await redirectToActiveRestaurantWorkspace("staffInvite", restaurantAdminRoles);
}
