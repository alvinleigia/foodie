import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantOrderingPointSettingsForm } from "@/components/admin/TenantAdminForms";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantOrderingPointPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      allowedRoles: restaurantAdminRoles,
      destination: "orderingPoint",
      restaurantSlug,
    });
  const dashboardHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "dashboard",
  );

  if (!snapshot.orderingPoint) {
    redirect(dashboardHref);
  }

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "orderingPoint",
      )}
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
        backHref={dashboardHref}
        orderingPoint={snapshot.orderingPoint}
      />
    </SaasAdminShell>
  );
}

