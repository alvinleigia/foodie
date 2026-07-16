import { OrganizationEditPanel } from "@/components/admin/OrganizationEditPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";

export default async function PlatformCompanyEditPage(
  props: PageProps<"/platform/companies/[id]">,
) {
  const { id } = await props.params;
  const { company, session } = await requirePlatformCompanyWorkspaceAccess({
    destination: "details",
    identifier: id,
  });

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
