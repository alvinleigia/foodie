import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { OrganizationEditPanel } from "@/components/admin/OrganizationEditPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompany } from "@/lib/saas-admin";

export default async function PlatformCompanyEditPage(
  props: PageProps<"/platform/companies/[id]">,
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
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Company settings"
      description="Edit company tenant details and lifecycle status."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <OrganizationEditPanel
        apiPath={`/api/platform/companies/${company.id}`}
        backHref="/platform/companies"
        entityLabel="Company"
        organization={company}
      />
    </SaasAdminShell>
  );
}
