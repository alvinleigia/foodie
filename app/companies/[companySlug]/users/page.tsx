import { PlatformCompanyUsersPanel } from "@/components/admin/PlatformCompanyUsersPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";
import { listCompanyUserMemberships } from "@/lib/saas-admin";

export default async function CompanyWorkspaceUsersPage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "users",
  });
  const users = await listCompanyUserMemberships(company.id);
  const usersHref = getCompanyWorkspaceHref(company.slug, "users");

  return (
    <SaasAdminShell
      activePath={usersHref}
      eyebrow="Company"
      title="Company users"
      description="Review and manage company and restaurant user access."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformCompanyUsersPanel
        assignHref={getCompanyWorkspaceHref(company.slug, "userReassign")}
        description="All accepted and invited users with access inside this company."
        editHrefBase={usersHref}
        emptyMessage="No users have been invited to this company yet."
        inviteHref={getCompanyWorkspaceHref(company.slug, "userInvite")}
        title="Users and access"
        users={users}
      />
    </SaasAdminShell>
  );
}
