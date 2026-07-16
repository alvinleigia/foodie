import { notFound } from "next/navigation";

import { CompanyUserAccessForm } from "@/components/admin/CompanyUserAccessForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";
import { getCompanyStaffMembership } from "@/lib/saas-admin";

export default async function PlatformCompanyUserAccessPage(
  props: PageProps<"/platform/companies/[id]/users/[membershipId]">,
) {
  const { id, membershipId } = await props.params;
  const { company, session } = await requirePlatformCompanyWorkspaceAccess({
    destination: "users",
    identifier: id,
    membershipId,
  });

  const companyUser = await getCompanyStaffMembership(company.id, membershipId);

  if (!companyUser) {
    notFound();
  }

  const usersHref = getPlatformCompanyWorkspaceHref(company.slug, "users");

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
