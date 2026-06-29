import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantLocationSettingsForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantLocationPage() {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.location) {
    redirect("/restaurant");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Location"
      title="Location settings"
      description="Edit the active operating location for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantLocationSettingsForm backHref="/restaurant" location={snapshot.location} />
    </SaasAdminShell>
  );
}
