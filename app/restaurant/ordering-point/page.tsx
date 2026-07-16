import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantOrderingPointSettingsForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantOrderingPointPage() {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.orderingPoint) {
    redirect("/restaurant");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant/ordering-point"
      eyebrow="Restaurant"
      title="Ordering point"
      description="Manage the default customer entry point and QR link for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantOrderingPointSettingsForm
        backHref="/restaurant"
        orderingPoint={snapshot.orderingPoint}
      />
    </SaasAdminShell>
  );
}
