import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RestaurantAdminPanel } from "@/components/admin/RestaurantAdminPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";

export default async function RestaurantStaffPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, restaurantAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant/staff"
      eyebrow="Restaurant"
      title="Restaurant staff"
      description="Review and manage staff access for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <RestaurantAdminPanel view="staff" />
    </SaasAdminShell>
  );
}
