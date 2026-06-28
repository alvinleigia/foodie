import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { DeleteCompanyForm } from "@/components/admin/DeleteCompanyForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompany } from "@/lib/saas-admin";

export default async function DeletePlatformCompanyPage(
  props: PageProps<"/platform/companies/[id]/delete">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const company = await getPlatformCompany(id);

  if (!company) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath="/platform"
      eyebrow="Platform"
      title="Delete company"
      description="Use this route for destructive tenant deletion with typed confirmation."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <DeleteCompanyForm companyId={company.id} companyName={company.name} />
    </SaasAdminShell>
  );
}
