import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffOrderBoard } from "@/components/staff/StaffOrderBoard";
import { listOrganizationFeatureEntitlements } from "@/lib/feature-entitlements";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantOrdersPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "orders",
    requiredPermission: "orders.view",
    restaurantSlug,
  });
  const entitlements = await listOrganizationFeatureEntitlements(
    access.restaurant.id,
  );
  const staffBillingEnabled =
    entitlements.find(
      (entitlement) => entitlement.key === "payments.staff_billing",
    )?.enabled ?? false;
  const stripePaymentsEnabled =
    entitlements.find((entitlement) => entitlement.key === "payments.stripe")
      ?.enabled ?? false;

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "orders")}
      contentMode="plain"
      eyebrow="Operations"
      title="Orders panel"
      description="Manage active and past restaurant orders."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <StaffOrderBoard
        restaurantSlug={access.restaurant.slug}
        staffBillingEnabled={staffBillingEnabled}
        stripePaymentsEnabled={stripePaymentsEnabled}
      />
    </SaasAdminShell>
  );
}

