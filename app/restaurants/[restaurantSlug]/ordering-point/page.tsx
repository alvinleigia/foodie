import { redirect } from "next/navigation";

import { CustomerOrderLinkPanel } from "@/components/admin/CustomerOrderLinkPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantOrderingPointSettingsForm } from "@/components/admin/TenantAdminForms";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import { getRestaurantCustomerOrderEntry } from "@/lib/tenant-domains";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantOrderingPointPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      destination: "orderingPoint",
      requiredPermission: "ordering_point.manage",
      restaurantSlug,
    });
  const dashboardHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "dashboard",
  );

  if (!snapshot.orderingPoint) {
    redirect(dashboardHref);
  }

  const customerOrdering = await getRestaurantCustomerOrderEntry(
    access.restaurant.id,
  );
  const orderingPointHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "orderingPoint",
  );

  return (
    <SaasAdminShell
      activePath={orderingPointHref}
      eyebrow="Restaurant"
      title="Customer ordering"
      description="Share the public menu link and manage its QR entry point."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        {customerOrdering ? (
          <CustomerOrderLinkPanel
            customerOrderUrl={customerOrdering.customerOrderUrl}
            isActive={customerOrdering.isActive}
            manageHref="#ordering-point-settings"
            restaurantSlug={access.restaurant.slug}
          />
        ) : null}
        <div id="ordering-point-settings" className="scroll-mt-6">
          <TenantOrderingPointSettingsForm
            backHref={dashboardHref}
            orderingPoint={snapshot.orderingPoint}
          />
        </div>
      </div>
    </SaasAdminShell>
  );
}

