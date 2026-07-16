import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyWorkspaceAuditLogsPage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "auditLogs",
  });

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "auditLogs")}
      eyebrow="Security"
      title="Audit logs"
      description="Review company and restaurant changes from one dedicated view."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <AuditLogPanel />
    </SaasAdminShell>
  );
}
