import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffSchedulePanel } from "@/components/staff/StaffSchedulePanel";
import { StaffAvailabilityPanel } from "@/components/staff/StaffAvailabilityPanel";
import { StaffShiftCoverPanel } from "@/components/staff/StaffShiftCoverPanel";
import { StaffTimeOffPanel } from "@/components/staff/StaffTimeOffPanel";
import { getPersonalStaffSchedule } from "@/lib/staff-schedule";
import { getPersonalShiftCoverBoard } from "@/lib/staff-shift-cover";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantPersonalSchedulePage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "schedule",
    requiredPermission: "staff_schedule.view",
    restaurantSlug,
  });
  const [schedule, coverBoard] = await Promise.all([
    getPersonalStaffSchedule(
      session.user.membershipId,
      access.tenantContext,
    ),
    getPersonalShiftCoverBoard(
      session.user.membershipId,
      access.tenantContext,
    ),
  ]);

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(access.restaurant.slug, "schedule")}
      eyebrow="Workforce"
      title="My schedule"
      description="Review your published restaurant shifts."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        <StaffSchedulePanel shifts={schedule.shifts} timezone={schedule.timezone} />
        <StaffShiftCoverPanel
          initialBoard={coverBoard}
          membershipId={session.user.membershipId}
          shifts={schedule.shifts}
        />
        <StaffAvailabilityPanel initialAvailability={schedule.availability} />
        <StaffTimeOffPanel initialRequests={schedule.timeOffRequests} />
      </div>
    </SaasAdminShell>
  );
}
