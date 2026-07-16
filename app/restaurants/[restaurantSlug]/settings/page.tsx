import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantRestaurantSettingsForm } from "@/components/admin/TenantAdminForms";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantSettingsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      allowedRoles: restaurantAdminRoles,
      destination: "settings",
      restaurantSlug,
    });
  const dashboardHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "dashboard",
  );

  return (
    <SaasAdminShell
      activePath={dashboardHref}
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
        backHref={dashboardHref}
        organization={snapshot.organization}
      />
    </SaasAdminShell>
  );
}

