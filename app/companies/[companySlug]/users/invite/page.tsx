import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyWorkspaceUserInvitePage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "userInvite",
  });
  const usersHref = getCompanyWorkspaceHref(company.slug, "users");

  return (
    <SaasAdminShell
      activePath={usersHref}
      eyebrow="Company"
      title="Invite company user"
      description="Create a one-time invite link for this company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <StaffInviteForm
        apiPath="/api/company/users/invite"
        assignExistingHref={`${getCompanyWorkspaceHref(company.slug, "userReassign")}?role=COMPANY_OWNER&returnTo=${encodeURIComponent(usersHref)}`}
        backHref={usersHref}
        defaultRole="COMPANY_OWNER"
        description="Company owners can manage restaurants and reporting."
        roles={[{ label: "Company Owner", value: "COMPANY_OWNER" }]}
        title="Invite user"
      />
    </SaasAdminShell>
  );
}
