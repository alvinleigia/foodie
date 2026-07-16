import { operationalRoles } from "@/lib/role-access";
import { redirectToActiveRestaurantWorkspace } from "@/lib/restaurant-workspace-access";

export default async function OperationsOrdersPage() {
  await redirectToActiveRestaurantWorkspace("orders", operationalRoles);
}
