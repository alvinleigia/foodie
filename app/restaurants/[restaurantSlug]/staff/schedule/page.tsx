import { StaffScheduleManager } from "@/components/admin/StaffScheduleManager";
import { StaffShiftCoverManager } from "@/components/admin/StaffShiftCoverManager";
import { StaffTimeOffManager } from "@/components/admin/StaffTimeOffManager";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getStaffScheduleConfiguration } from "@/lib/staff-schedule";
import { getManagerShiftCoverBoard } from "@/lib/staff-shift-cover";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffSchedulePage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "staffSchedule",
    requiredPermission: "staff_schedule.manage",
    restaurantSlug,
  });
  const [configuration, coverBoard] = await Promise.all([
    getStaffScheduleConfiguration(access.tenantContext),
    getManagerShiftCoverBoard(access.tenantContext),
  ]);

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "staffSchedule",
      )}
      eyebrow="Workforce"
      title="Staff schedule"
      description="Plan upcoming shifts using assigned restaurant jobs."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        <StaffScheduleManager initialConfiguration={configuration} />
        <StaffShiftCoverManager
          key={coverBoard.requests
            .map(
              (request) =>
                `${request.id}:${request.status}:${request.claims
                  .map((claim) => `${claim.id}:${claim.status}`)
                  .join(",")}`,
            )
            .join("|")}
          initialBoard={coverBoard}
        />
        <StaffTimeOffManager
          initialRequests={configuration.timeOffRequests}
        />
      </div>
    </SaasAdminShell>
  );
}
