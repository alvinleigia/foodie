import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { PrepStationManager } from "@/components/staff/PrepStationManager";
import { getPrepStationConfiguration } from "@/lib/prep-stations";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantPreparationStationsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "prepStations",
    requiredPermission: "menu.manage",
    restaurantSlug,
  });
  const stations = await getPrepStationConfiguration(access.tenantContext);

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "prepStations",
      )}
      eyebrow="Menu routing"
      title="Preparation stations"
      description="Manage the work areas used to prepare restaurant products."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <PrepStationManager initialStations={stations} />
    </SaasAdminShell>
  );
}
