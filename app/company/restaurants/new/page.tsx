import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreateRestaurantForm } from "@/components/admin/CreateRestaurantForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";

export default async function NewCompanyRestaurantPage() {
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
      title="Add restaurant"
      description="Create a child restaurant and its first operational location."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CreateRestaurantForm backHref="/company" />
    </SaasAdminShell>
  );
}
