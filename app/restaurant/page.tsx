import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";

export default async function RestaurantPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, restaurantAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Restaurant"
      title="Restaurant admin"
      description="Manage this restaurant location, settings and staff access from a dedicated SaaS admin route."
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
