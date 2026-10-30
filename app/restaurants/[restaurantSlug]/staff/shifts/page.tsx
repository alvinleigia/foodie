import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffShiftRecordsPanel } from "@/components/admin/StaffShiftRecordsPanel";
import { getStaffPayrollExportRuns } from "@/lib/staff-payroll";
import { getRestaurantStaffShiftRecords } from "@/lib/staff-time-clock";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffShiftsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "staffShifts",
    requiredPermission: "time_clock.manage",
    restaurantSlug,
  });
  const [shifts, payrollRuns] = await Promise.all([
    getRestaurantStaffShiftRecords(access.tenantContext),
    getStaffPayrollExportRuns(access.tenantContext),
  ]);

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "staffShifts",
      )}
      eyebrow="Workforce"
      title="Staff shifts"
      description="Review active and recently completed time clock records."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <StaffShiftRecordsPanel payrollRuns={payrollRuns} shifts={shifts} />
    </SaasAdminShell>
  );
}
