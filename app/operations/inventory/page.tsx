import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { InventoryManager } from "@/components/staff/InventoryManager";
import { OperationsSetupRequired } from "@/components/staff/OperationsSetupRequired";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export default async function OperationsInventoryPage() {
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
      activePath="/operations/inventory"
      contentMode="plain"
      eyebrow="Inventory"
      title="Track product stock"
      description="Manage stock levels for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      {hasRestaurantAccess ? (
        <InventoryManager />
      ) : (
        <OperationsSetupRequired />
      )}
    </SaasAdminShell>
  );
}
