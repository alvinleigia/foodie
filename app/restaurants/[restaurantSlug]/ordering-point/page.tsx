import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantOrderingPointSettingsForm } from "@/components/admin/TenantAdminForms";
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
      destination: "orderingPoint",
      requiredPermission: "ordering_point.manage",
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
        permissions: session.user.permissions,
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

