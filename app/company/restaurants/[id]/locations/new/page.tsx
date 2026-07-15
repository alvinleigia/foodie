import { redirect } from "next/navigation";

export default async function NewCompanyRestaurantLocationPage(
  props: PageProps<"/company/restaurants/[id]/locations/new">,
) {
  const { id } = await props.params;
  redirect(`/company/restaurants/${id}`);
}
