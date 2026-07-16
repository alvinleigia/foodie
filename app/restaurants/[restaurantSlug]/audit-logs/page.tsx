import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantAuditLogsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "auditLogs",
    restaurantSlug,
  });

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "auditLogs")}
      eyebrow="Security"
      title="Audit logs"
      description="Review scoped admin, menu, inventory and order changes from one dedicated view."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <AuditLogPanel />
    </SaasAdminShell>
  );
}
