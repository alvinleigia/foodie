import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanyDomainsPanel } from "@/components/admin/CompanyDomainsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import {
  getPlatformCompany,
  listCompanyDomains,
  listCompanyRestaurants,
} from "@/lib/saas-admin";

export default async function PlatformCompanyDomainsPage(
  props: PageProps<"/platform/companies/[id]/domains">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const [company, domains, restaurants] = await Promise.all([
    getPlatformCompany(id),
    listCompanyDomains(id),
    listCompanyRestaurants(id),
  ]);

  if (!company || !domains) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Company domains"
      description={`Link custom domains and company subdomains for ${company.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <CompanyDomainsPanel
        apiPath={`/api/platform/companies/${company.id}/domains`}
        backHref="/platform/companies"
        companyName={company.name}
        restaurants={restaurants.map((restaurant) => ({
          id: restaurant.id,
          name: restaurant.name,
        }))}
        domains={domains.map((domain) => ({
          id: domain.id,
          domain: domain.domain,
          scope: domain.scope,
          purpose: domain.purpose,
          restaurantOrganizationId: domain.restaurantOrganizationId,
          restaurantName: domain.restaurantName,
          isPrimary: domain.isPrimary,
          isActive: domain.isActive,
          createdAt: domain.createdAt.toISOString(),
          updatedAt: domain.updatedAt.toISOString(),
        }))}
      />
    </SaasAdminShell>
  );
}
