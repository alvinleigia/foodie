import { CompanyRestaurantsPanel } from "@/components/admin/CompanyRestaurantsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyWorkspaceRestaurantsPage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "restaurants",
  });

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title="Restaurants"
      description="Manage restaurants, staff access and operational settings."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyRestaurantsPanel
        companySlug={company.slug}
        hasRealCompanyContext
        view="management"
      />
    </SaasAdminShell>
  );
}
