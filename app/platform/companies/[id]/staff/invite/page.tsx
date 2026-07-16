import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";

export default async function PlatformCompanyStaffInvitePage(
  props: PageProps<"/platform/companies/[id]/staff/invite">,
) {
  const { id } = await props.params;
  const { company, session } = await requirePlatformCompanyWorkspaceAccess({
    destination: "staffInvite",
    identifier: id,
  });
  const usersHref = getPlatformCompanyWorkspaceHref(company.slug, "users");

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
        assignExistingHref={`/platform/users/reassign?companySlug=${encodeURIComponent(company.slug)}&role=COMPANY_OWNER&returnTo=${encodeURIComponent(usersHref)}`}
        backHref={usersHref}
        defaultRole="COMPANY_OWNER"
        description="Company owners can manage child restaurants and reporting."
        roles={[{ label: "Company Owner", value: "COMPANY_OWNER" }]}
        title={`Invite user to ${company.name}`}
      />
    </SaasAdminShell>
  );
}
