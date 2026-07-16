import { restaurantAdminRoles } from "@/lib/role-access";
import { redirectToActiveRestaurantWorkspace } from "@/lib/restaurant-workspace-access";

export default async function OperationsMenuPage() {
  await redirectToActiveRestaurantWorkspace("menu", restaurantAdminRoles);
}
