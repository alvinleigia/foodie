import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantStaffInviteForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantStaffInvitePage() {
  const { session } = await requireRestaurantAdminPage();

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Staff"
      title="Invite staff"
      description="Create a one-time invitation link for this restaurant location."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantStaffInviteForm backHref="/restaurant" />
    </SaasAdminShell>
  );
}
