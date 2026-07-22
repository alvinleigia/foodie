import { notFound } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { InventoryManager } from "@/components/staff/InventoryManager";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantInventoryPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "inventory",
    requiredPermission: "inventory.manage",
    restaurantSlug,
  });
  const inventoryEntitlement = await getOrganizationFeatureEntitlement(
    access.restaurant.id,
    "operations.inventory",
  );

  if (!inventoryEntitlement.enabled) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "inventory")}
      contentMode="plain"
      eyebrow="Inventory"
      title="Track product stock"
      description="Manage stock levels for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <InventoryManager />
    </SaasAdminShell>
  );
}
