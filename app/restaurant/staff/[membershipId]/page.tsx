import { notFound } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantStaffAccessForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantStaffAccessPage(
  props: PageProps<"/restaurant/staff/[membershipId]">,
) {
  const { membershipId } = await props.params;
  const { session, snapshot } = await requireRestaurantAdminPage();
  const staff = snapshot.staff.find((item) => item.membershipId === membershipId);

  if (!staff) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath="/restaurant/staff"
      eyebrow="Staff"
      title="Edit staff access"
      description="Adjust this user's role or active access for the current restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantStaffAccessForm backHref="/restaurant/staff" staff={staff} />
    </SaasAdminShell>
  );
}
