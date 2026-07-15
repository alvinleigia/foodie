import { redirect } from "next/navigation";

export default async function CompanyRestaurantLocationStaffInvitePage(
  props: PageProps<"/company/restaurants/[id]/locations/[locationId]/staff/invite">,
) {
  const { id } = await props.params;
  redirect(`/company/restaurants/${id}/staff/invite`);
}
