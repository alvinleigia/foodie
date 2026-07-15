import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CommercialAccessBlocked } from "@/components/admin/CommercialAccessBlocked";
import { MenuManager } from "@/components/staff/MenuManager";
import { OperationsSetupRequired } from "@/components/staff/OperationsSetupRequired";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { getTenantSubscriptionAccess } from "@/lib/billing";
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
  const commercialAccess = session.user.organizationId
    ? await getTenantSubscriptionAccess(session.user.organizationId)
    : { allowed: true, status: null };

  return (
    <AppShell variant="dark">
      <AppHeader
        activePath="/operations/menu"
        user={{ name: session.user.name, role: session.user.role }}
      />
      {!commercialAccess.allowed ? (
        <CommercialAccessBlocked status={commercialAccess.status} />
      ) : hasRestaurantAccess ? (
        <MenuManager />
      ) : (
        <OperationsSetupRequired />
      )}
    </AppShell>
  );
}
