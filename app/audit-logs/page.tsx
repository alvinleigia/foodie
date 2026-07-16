import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { auditLogRoles, canAccessRole } from "@/lib/role-access";
import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";

export default async function AuditLogsPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, auditLogRoles)) {
    redirect("/staff/login");
  }

  if (session.user.role === "RESTAURANT_MANAGER") {
    const access = await getCurrentStaffRestaurantAccess().catch(() => null);

    if (access) {
      redirect(getRestaurantWorkspaceHref(access.restaurant.slug, "auditLogs"));
    }
  }

  if (session.user.role === "COMPANY_OWNER") {
    await redirectToActiveCompanyWorkspace("auditLogs");
  }

  return (
    <SaasAdminShell
      activePath="/audit-logs"
      eyebrow="Security"
      title="Audit logs"
      description="Review scoped admin, menu, inventory and order changes from one dedicated view."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <AuditLogPanel />
    </SaasAdminShell>
  );
}
