import { redirect } from "next/navigation";

export default async function CompanyRestaurantLocationStaffPage(
  props: PageProps<"/company/restaurants/[id]/locations/[locationId]/staff">,
) {
  const { id } = await props.params;
  redirect(`/company/restaurants/${id}/staff`);
}
