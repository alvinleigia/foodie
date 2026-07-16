import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { MenuManager } from "@/components/staff/MenuManager";
import { OperationsSetupRequired } from "@/components/staff/OperationsSetupRequired";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export default async function OperationsMenuPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, restaurantAdminRoles)) {
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
      activePath="/operations/menu"
      contentMode="plain"
      eyebrow="Menu Manager"
      title="Manage categories and products"
      description="Create menu sections and restaurant products."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      {hasRestaurantAccess ? (
        <MenuManager />
      ) : (
        <OperationsSetupRequired />
      )}
    </SaasAdminShell>
  );
}
