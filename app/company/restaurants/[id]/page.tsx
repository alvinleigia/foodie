import { redirectToActiveCompanyRestaurantWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyRestaurantEditPage(
  props: PageProps<"/company/restaurants/[id]">,
) {
  const { id } = await props.params;

  await redirectToActiveCompanyRestaurantWorkspace(id, "settings");
}
