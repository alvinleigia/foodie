import { notFound } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffJobAssignmentForm } from "@/components/admin/StaffJobAssignmentForm";
import { TenantStaffAccessForm } from "@/components/admin/TenantAdminForms";
import {
  getStaffJobAssignment,
  getStaffJobConfiguration,
} from "@/lib/staff-jobs";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

type RestaurantStaffAccessPageProps = RestaurantWorkspacePageProps & {
  params: Promise<{ membershipId: string; restaurantSlug: string }>;
};

export default async function RestaurantStaffAccessPage({
  params,
}: RestaurantStaffAccessPageProps) {
  const { membershipId, restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      destination: "staff",
      requiredPermission: "staff.manage",
      restaurantSlug,
    });
  const staff = snapshot.staff.find((item) => item.membershipId === membershipId);

  if (!staff) {
    notFound();
  }

  const staffHref = getRestaurantWorkspaceHref(access.restaurant.slug, "staff");
  const jobsHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "staffJobs",
  );
  const [jobConfiguration, jobAssignment] = await Promise.all([
    getStaffJobConfiguration(access.tenantContext),
    getStaffJobAssignment(membershipId, access.tenantContext),
  ]);
  const primaryJobPermissions = jobConfiguration.jobs.find(
    (job) => job.id === jobAssignment.primaryJobId,
  )?.permissions;

  return (
    <SaasAdminShell
      activePath={staffHref}
      eyebrow="Staff"
      title="Edit staff access"
      description="Adjust this user's role or active access for the current restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        <StaffJobAssignmentForm
          initialAssignment={jobAssignment}
          jobs={jobConfiguration.jobs}
          jobsHref={jobsHref}
          membershipId={membershipId}
          staffName={staff.name}
        />
        <TenantStaffAccessForm
          key={jobAssignment.primaryJobId ?? "role-defaults"}
          backHref={staffHref}
          permissionBaseline={primaryJobPermissions}
          staff={staff}
        />
      </div>
    </SaasAdminShell>
  );
}

