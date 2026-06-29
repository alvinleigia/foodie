import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanySubscriptionForm } from "@/components/admin/CompanySubscriptionForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompanyWithSubscription } from "@/lib/saas-admin";

export default async function PlatformCompanySubscriptionPage(
  props: PageProps<"/platform/companies/[id]/subscription">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const company = await getPlatformCompanyWithSubscription(id);

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
        backHref="/platform/companies"
        companyName={company.name}
        currentStatus={company.subscription.status}
      />
    </SaasAdminShell>
  );
}
