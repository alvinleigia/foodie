import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";

export default async function RestaurantPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, restaurantAdminRoles)) {
    redirect("/staff/login");
  }

  if (!(await isSessionAccessAllowedForCurrentDomain(session.user))) {
    redirect("/dashboard");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Restaurant"
      title="Restaurant dashboard"
      description="Review restaurant operations, reports and setup health from one overview."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <RestaurantAdminPanel />
    </SaasAdminShell>
  );
}
