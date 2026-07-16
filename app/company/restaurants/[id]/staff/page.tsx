import { redirectToActiveCompanyRestaurantWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyRestaurantStaffPage(
  props: PageProps<"/company/restaurants/[id]/staff">,
) {
  const { id } = await props.params;

  await redirectToActiveCompanyRestaurantWorkspace(id, "staff");
}
