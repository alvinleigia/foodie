import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { OperationsSetupRequired } from "@/components/staff/OperationsSetupRequired";
import { StaffOrderBoard } from "@/components/staff/StaffOrderBoard";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import { canAccessRole, operationalRoles } from "@/lib/role-access";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export default async function OperationsOrdersPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, operationalRoles)) {
    redirect("/staff/login");
  }

  if (!(await isSessionAccessAllowedForCurrentDomain(session.user))) {
    redirect("/dashboard");
  }

  const hasRestaurantAccess = Boolean(
    await getCurrentTenantContext().catch(() => null),
  );

  return (
    <SaasAdminShell
      activePath="/operations/orders"
      contentMode="plain"
      eyebrow="Operations"
      title="Orders panel"
      description="Manage active and past restaurant orders."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      {hasRestaurantAccess ? (
        <StaffOrderBoard />
      ) : (
        <OperationsSetupRequired />
      )}
    </SaasAdminShell>
  );
}
