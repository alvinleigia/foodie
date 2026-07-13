import { redirect } from "next/navigation";

import { requireMenuManagerSession } from "@/lib/auth";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import { getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function requireRestaurantAdminPage() {
  const session = await requireMenuManagerSession();

  if (!session) {
    redirect("/staff/login");
  }

  if (!(await isSessionAccessAllowedForCurrentDomain(session.user))) {
    redirect("/dashboard");
  }

  try {
    const context = await getCurrentTenantContext();
    const snapshot = await getTenantAdminSnapshot(context);

    return { session, snapshot };
  } catch {
    redirect("/company");
  }
}
