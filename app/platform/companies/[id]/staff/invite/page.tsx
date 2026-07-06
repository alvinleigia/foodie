import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompany } from "@/lib/saas-admin";

export default async function PlatformCompanyStaffInvitePage(
  props: PageProps<"/platform/companies/[id]/staff/invite">,
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

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Invite company user"
      description={`Create a one-time invite link for ${company.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <StaffInviteForm
        apiPath={`/api/platform/companies/${company.id}/staff`}
        assignExistingHref={`/platform/users/reassign?companyId=${company.id}&role=COMPANY_OWNER&returnTo=${encodeURIComponent(`/platform/companies/${company.id}/users`)}`}
        backHref={`/platform/companies/${company.id}/users`}
        defaultRole="COMPANY_OWNER"
        description="Company owners can manage child restaurants and reporting."
        roles={[{ label: "Company Owner", value: "COMPANY_OWNER" }]}
        title={`Invite user to ${company.name}`}
      />
    </SaasAdminShell>
  );
}
