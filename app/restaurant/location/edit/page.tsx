import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantLocationSettingsForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantLocationEditPage() {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.location) {
    redirect("/restaurant/location");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant/location"
      eyebrow="Location"
      title="Edit location"
      description="Update the active operating location for this restaurant."
      user={{
        locationId: session.user.locationId,
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantLocationSettingsForm backHref="/restaurant/location" location={snapshot.location} />
    </SaasAdminShell>
  );
}
