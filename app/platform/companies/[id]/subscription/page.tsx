import { notFound } from "next/navigation";

import { CompanySubscriptionForm } from "@/components/admin/CompanySubscriptionForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getPlatformCompanyWorkspaceHref } from "@/lib/platform-company-workspace";
import { requirePlatformCompanyWorkspaceAccess } from "@/lib/platform-company-workspace-access";
import { getPlatformCompanyWithSubscription } from "@/lib/saas-admin";

export default async function PlatformCompanySubscriptionPage(
  props: PageProps<"/platform/companies/[id]/subscription">,
) {
  const { id } = await props.params;
  const { company: companyRecord, session } =
    await requirePlatformCompanyWorkspaceAccess({
      destination: "subscription",
      identifier: id,
    });
  const company = await getPlatformCompanyWithSubscription(companyRecord.id);

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
      <CompanySubscriptionForm
        apiPath={`/api/platform/companies/${company.id}/subscription`}
        backHref={getPlatformCompanyWorkspaceHref(company.slug, "details")}
        companyName={company.name}
        currentStatus={company.subscription.status}
      />
    </SaasAdminShell>
  );
}
