import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function NewCompanyRestaurantPage() {
  await redirectToActiveCompanyWorkspace("restaurantNew");
}
