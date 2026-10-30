import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffTimeClockPanel } from "@/components/staff/StaffTimeClockPanel";
import { getStaffTimeClockSnapshot } from "@/lib/staff-time-clock";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantTimeClockPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "timeClock",
    requiredPermission: "time_clock.use",
    restaurantSlug,
  });
  const snapshot = await getStaffTimeClockSnapshot(
    session.user.membershipId,
    access.tenantContext,
  );

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "timeClock",
      )}
      eyebrow="Workforce"
      title="Time clock"
      description="Record your restaurant shift and breaks."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <StaffTimeClockPanel initialSnapshot={snapshot} />
    </SaasAdminShell>
  );
}
