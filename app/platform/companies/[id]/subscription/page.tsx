import { notFound } from "next/navigation";

import { CompanyFeatureEntitlementsForm } from "@/components/admin/CompanyFeatureEntitlementsForm";
import { CompanySubscriptionForm } from "@/components/admin/CompanySubscriptionForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { listActiveSaasPlans } from "@/lib/billing";
import { listOrganizationFeatureEntitlements } from "@/lib/feature-entitlements";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";
import {
  getPlatformCompanyWithSubscription,
  listCompanyRestaurants,
} from "@/lib/saas-admin";

export default async function PlatformCompanySubscriptionPage(
  props: PageProps<"/platform/companies/[id]/subscription">,
) {
  const { id } = await props.params;
  const { company: companyRecord, session } =
    await requirePlatformCompanyWorkspaceAccess({
      destination: "subscription",
      identifier: id,
    });
  const [company, restaurants, initialEntitlements, plans] = await Promise.all([
    getPlatformCompanyWithSubscription(companyRecord.id),
    listCompanyRestaurants(companyRecord.id),
    listOrganizationFeatureEntitlements(companyRecord.id),
    listActiveSaasPlans(),
  ]);

  if (!company || !company.subscription) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath="/platform/companies"
      eyebrow="Platform"
      title="Subscription settings"
      description={`Manage commercial access for ${company.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        <CompanySubscriptionForm
          apiPath={`/api/platform/companies/${company.id}/subscription`}
          backHref={getPlatformCompanyWorkspaceHref(company.slug, "details")}
          companyName={company.name}
          currentPlanSlug={company.subscription.plan?.slug ?? ""}
          currentStatus={company.subscription.status}
          plans={plans}
        />
        <CompanyFeatureEntitlementsForm
          apiPath={`/api/platform/companies/${company.id}/features`}
          initialEntitlements={initialEntitlements}
          scopes={[
            { id: company.id, name: company.name, type: "COMPANY" },
            ...restaurants.map((restaurant) => ({
              id: restaurant.id,
              name: restaurant.name,
              type: "RESTAURANT" as const,
            })),
          ]}
        />
      </div>
    </SaasAdminShell>
  );
}
