import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanyUserAccessForm } from "@/components/admin/CompanyUserAccessForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import {
  getCompanyStaffMembership,
  getPlatformCompany,
} from "@/lib/saas-admin";

export default async function PlatformCompanyUserAccessPage(
  props: PageProps<"/platform/companies/[id]/users/[membershipId]">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const { id, membershipId } = await props.params;
  const company = await getPlatformCompany(id);

  if (!company) {
    notFound();
  }

  const companyUser = await getCompanyStaffMembership(company.id, membershipId);

  if (!companyUser) {
    notFound();
  }

  const usersHref = `/platform/companies/${company.id}/users`;

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Edit company user"
      description={`Adjust access for ${companyUser.name} in ${company.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyUserAccessForm
        apiPath={`/api/platform/companies/${company.id}/users/${companyUser.membershipId}`}
        backHref={usersHref}
        user={companyUser}
      />
    </SaasAdminShell>
  );
}
