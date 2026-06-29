import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantRestaurantSettingsForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantSettingsPage() {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.organization) {
    redirect("/restaurant");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Restaurant"
      title="Restaurant settings"
      description="Edit the current restaurant profile in a focused setup screen."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantRestaurantSettingsForm
        backHref="/restaurant"
        organization={snapshot.organization}
      />
    </SaasAdminShell>
  );
}
