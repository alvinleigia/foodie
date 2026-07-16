import { PlatformCompanyUsersPanel } from "@/components/admin/PlatformCompanyUsersPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";
import { listCompanyStaffMemberships } from "@/lib/saas-admin";

export default async function PlatformCompanyUsersPage(
  props: PageProps<"/platform/companies/[id]/users">,
) {
  const { id } = await props.params;
  const { company, session } = await requirePlatformCompanyWorkspaceAccess({
    destination: "users",
    identifier: id,
  });

  const users = await listCompanyStaffMemberships(company.id);
  const companyUsersPath = getPlatformCompanyWorkspaceHref(company.slug, "users");
  const assignHref = `/platform/users/reassign?companySlug=${encodeURIComponent(company.slug)}&role=COMPANY_OWNER&returnTo=${encodeURIComponent(companyUsersPath)}`;

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title={`${company.name} users`}
      description="Manage company owner memberships."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformCompanyUsersPanel
        assignHref={assignHref}
        editHrefBase={companyUsersPath}
        inviteHref={getPlatformCompanyWorkspaceHref(company.slug, "staffInvite")}
        users={users}
      />
    </SaasAdminShell>
  );
}
