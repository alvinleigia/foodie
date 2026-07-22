import { notFound } from "next/navigation";

import { CompanyDomainsPanel } from "@/components/admin/CompanyDomainsPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";
import {
  listCompanyDomains,
  listCompanyRestaurants,
} from "@/lib/saas-admin";

export default async function PlatformCompanyDomainsPage(
  props: PageProps<"/platform/companies/[id]/domains">,
) {
  const { id } = await props.params;
  const { company, session } = await requirePlatformCompanyWorkspaceAccess({
    destination: "domains",
    identifier: id,
  });
  const [domains, restaurants] = await Promise.all([
    listCompanyDomains(company.id),
    listCompanyRestaurants(company.id),
  ]);

  if (!domains) {
    notFound();
  }

  const customDomainAccess = await Promise.all(
    [company, ...restaurants].map(async (organization) => ({
      enabled: (
        await getOrganizationFeatureEntitlement(
          organization.id,
          "branding.custom_domains",
        )
      ).enabled,
      organizationId: organization.id,
    })),
  );
  const customDomainAccessByOrganizationId = new Map(
    customDomainAccess.map((access) => [access.organizationId, access.enabled]),
  );

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
        backHref={getPlatformCompanyWorkspaceHref(company.slug, "details")}
        companyName={company.name}
        companyCustomDomainsEnabled={
          customDomainAccessByOrganizationId.get(company.id) ?? false
        }
        restaurants={restaurants.map((restaurant) => ({
          customDomainsEnabled:
            customDomainAccessByOrganizationId.get(restaurant.id) ?? false,
          id: restaurant.id,
          name: restaurant.name,
        }))}
        domains={domains.map((domain) => ({
          id: domain.id,
          domain: domain.domain,
          isCustomDomain: domain.isCustomDomain,
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
