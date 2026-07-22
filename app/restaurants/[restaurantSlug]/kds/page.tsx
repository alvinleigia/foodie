import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { KdsBoard } from "@/components/staff/KdsBoard";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantKdsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "kds",
    requiredPermission: "orders.view",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "kds")}
      contentMode="panel"
      eyebrow="Preparation"
      title="Kitchen display"
      description="Monitor routed kitchen and bar tickets in one operational view."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <KdsBoard />
    </SaasAdminShell>
  );
}
