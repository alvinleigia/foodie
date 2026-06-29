import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlatformCompaniesPanel } from "@/components/admin/PlatformCompaniesPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";

export default async function PlatformCompaniesPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Companies"
      description="Manage parent company tenants, domains, subscriptions and exports."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformCompaniesPanel />
    </SaasAdminShell>
  );
}
