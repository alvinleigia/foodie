import { RestaurantReportsPanel } from "@/components/admin/RestaurantReportsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";

export default async function RestaurantReportsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "reports",
    requiredPermission: "reports.view",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "reports")}
      description="Review sales, payments, tax, fulfilment and operational performance."
      eyebrow="Reporting"
      title="Restaurant reports"
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <RestaurantReportsPanel />
    </SaasAdminShell>
  );
}
