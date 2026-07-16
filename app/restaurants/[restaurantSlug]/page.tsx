import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { restaurantAdminRoles } from "@/lib/role-access";
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
    allowedRoles: restaurantAdminRoles,
    destination: "dashboard",
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
        role: session.user.role,
      }}
    >
      <RestaurantAdminPanel restaurantSlug={access.restaurant.slug} />
    </SaasAdminShell>
  );
}

