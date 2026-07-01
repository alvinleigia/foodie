import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlatformDashboardPanel } from "@/components/admin/PlatformDashboardPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";

export default async function PlatformPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/platform"
      eyebrow="Platform"
      title="Platform dashboard"
      description="Monitor SaaS health, tenant activity and platform-wide usage."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformDashboardPanel />
    </SaasAdminShell>
  );
}
