import { redirect } from "next/navigation";

export default async function CompanyRestaurantLocationsPage(
  props: PageProps<"/company/restaurants/[id]/locations">,
) {
  const { id } = await props.params;
  redirect(`/company/restaurants/${id}`);
}
