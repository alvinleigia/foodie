import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyRestaurantsPage() {
  await redirectToActiveCompanyWorkspace("restaurants");
}
