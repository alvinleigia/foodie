import { CompanyRestaurantsPanel } from "@/components/admin/CompanyRestaurantsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyWorkspacePage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "dashboard",
  });

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "dashboard")}
      eyebrow="Company"
      title="Company dashboard"
      description="Review cross-restaurant summaries and operational health for the selected parent company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyRestaurantsPanel companySlug={company.slug} hasRealCompanyContext />
    </SaasAdminShell>
  );
}
