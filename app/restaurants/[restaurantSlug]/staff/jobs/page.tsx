import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffJobManager } from "@/components/admin/StaffJobManager";
import { getStaffJobConfiguration } from "@/lib/staff-jobs";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffJobsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "staffJobs",
    requiredPermission: "staff.manage",
    restaurantSlug,
  });
  const configuration = await getStaffJobConfiguration(access.tenantContext);

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "staffJobs",
      )}
      eyebrow="Workforce"
      title="Staff jobs"
      description="Create reusable permission sets for restaurant staff."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <StaffJobManager initialJobs={configuration.jobs} />
    </SaasAdminShell>
  );
}
