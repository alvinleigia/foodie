import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanyRestaurantsPanel } from "@/components/admin/CompanyRestaurantsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";

export default async function CompanyPage() {
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
      activePath="/company"
      eyebrow="Company"
      title="Company dashboard"
      description="Manage restaurants and view cross-restaurant summaries for the selected parent company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyRestaurantsPanel hasRealCompanyContext />
    </SaasAdminShell>
  );
}
