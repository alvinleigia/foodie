import { restaurantAdminRoles } from "@/lib/role-access";
import { redirectToActiveRestaurantWorkspace } from "@/lib/restaurant-workspace-access";

export default async function RestaurantIntegrationsPage() {
  await redirectToActiveRestaurantWorkspace("integrations", restaurantAdminRoles);
}
