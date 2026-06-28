import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreateCompanyForm } from "@/components/admin/CreateCompanyForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";

export default async function NewPlatformCompanyPage() {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/platform"
      eyebrow="Platform"
      title="Add company"
      description="Create a parent company tenant before inviting company users or adding restaurants."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CreateCompanyForm />
    </SaasAdminShell>
  );
}
