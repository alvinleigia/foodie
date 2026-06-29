import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlatformCompanyUsersPanel } from "@/components/admin/PlatformCompanyUsersPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompany, listCompanyStaffMemberships } from "@/lib/saas-admin";

export default async function PlatformCompanyUsersPage(
  props: PageProps<"/platform/companies/[id]/users">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const company = await getPlatformCompany(id);

  if (!company) {
    notFound();
  }

  const users = await listCompanyStaffMemberships(company.id);

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title={`${company.name} users`}
      description="Manage company owner and manager memberships."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformCompanyUsersPanel companyId={company.id} users={users} />
    </SaasAdminShell>
  );
}
