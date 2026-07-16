import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "staff",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "staff")}
      eyebrow="Restaurant"
      title="Restaurant staff"
      description="Review and manage staff access for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <RestaurantAdminPanel
        restaurantSlug={access.restaurant.slug}
        view="staff"
      />
    </SaasAdminShell>
  );
}

