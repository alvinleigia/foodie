import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantWorkspacePage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "dashboard",
    requiredPermission: "restaurant.dashboard",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "dashboard")}
      eyebrow="Restaurant"
      title="Restaurant dashboard"
      description="Review restaurant operations, reports and setup health from one overview."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <RestaurantAdminPanel restaurantSlug={access.restaurant.slug} />
    </SaasAdminShell>
  );
}

