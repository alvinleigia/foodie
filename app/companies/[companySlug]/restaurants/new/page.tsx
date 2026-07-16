import { CreateRestaurantForm } from "@/components/admin/CreateRestaurantForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyWorkspaceNewRestaurantPage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "restaurantNew",
  });

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title="Add restaurant"
      description="Create a restaurant under this company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CreateRestaurantForm
        backHref={getCompanyWorkspaceHref(company.slug, "restaurants")}
      />
    </SaasAdminShell>
  );
}
