import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanyRestaurantsPanel } from "@/components/admin/CompanyRestaurantsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";

export default async function CompanyRestaurantsPage() {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/company/restaurants"
      eyebrow="Company"
      title="Restaurants"
      description="Manage restaurants and drill into their location setup."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyRestaurantsPanel hasRealCompanyContext view="management" />
    </SaasAdminShell>
  );
}
