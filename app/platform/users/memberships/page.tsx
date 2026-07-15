import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlatformUserMembershipsPanel } from "@/components/admin/PlatformUserMembershipsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { listPlatformUserMemberships } from "@/lib/saas-admin";

export default async function PlatformUserMembershipsPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const users = await listPlatformUserMemberships();

  return (
    <SaasAdminShell
      activePath="/platform/users/memberships"
      eyebrow="Platform"
      title="User memberships"
      description="Review every user access assignment across companies and restaurants."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PlatformUserMembershipsPanel users={users} />
    </SaasAdminShell>
  );
}
