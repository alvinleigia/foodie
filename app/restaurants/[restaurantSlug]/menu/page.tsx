import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { MenuManager } from "@/components/staff/MenuManager";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantMenuPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "menu",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "menu")}
      contentMode="plain"
      eyebrow="Menu Manager"
      title="Manage categories and products"
      description="Create menu sections and restaurant products."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <MenuManager />
    </SaasAdminShell>
  );
}

