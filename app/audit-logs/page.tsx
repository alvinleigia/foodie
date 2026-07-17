import { redirect } from "next/navigation";

import { auth } from "@/auth";
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

  redirect("/platform/audit-logs");
}
