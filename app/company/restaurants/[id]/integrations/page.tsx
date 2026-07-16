import { redirectToActiveCompanyRestaurantWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyRestaurantIntegrationsPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;

  await redirectToActiveCompanyRestaurantWorkspace(id, "integrations");
}
