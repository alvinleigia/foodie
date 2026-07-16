import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlatformCompanyUsersPanel } from "@/components/admin/PlatformCompanyUsersPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import { listCompanyUserMemberships } from "@/lib/saas-admin";

export default async function CompanyUsersPage() {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  const users = await listCompanyUserMemberships(session.user.organizationId);

  return (
    <SaasAdminShell
      activePath="/company/users"
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
        assignHref="/company/users/reassign"
        companyId={session.user.organizationId}
        description="All accepted and invited users with access inside this company."
        editHrefBase="/company/users"
        emptyMessage="No users have been invited to this company yet."
        inviteHref="/company/users/invite"
        title="Users and access"
        users={users}
      />
    </SaasAdminShell>
  );
}
