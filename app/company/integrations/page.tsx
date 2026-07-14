import { redirect } from "next/navigation";

import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { OAuthIntegrationForm } from "@/components/admin/OAuthIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import { requireRole } from "@/lib/auth";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationOAuthSettingsSnapshots } from "@/lib/organization-oauth-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { getRequestOrigin } from "@/lib/request-origin";
import { companyAdminRoles } from "@/lib/role-access";

export default async function CompanyIntegrationsPage() {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    redirect("/staff/login");
  }

  const [callbackOrigin, emailSnapshot, oauthSnapshots, paymentSnapshot] = await Promise.all([
    getRequestOrigin(),
    getOrganizationEmailSettingsSnapshot(session.user.organizationId),
    getOrganizationOAuthSettingsSnapshots(session.user.organizationId),
    getOrganizationPaymentSettingsSnapshot(session.user.organizationId),
  ]);

  return (
    <SaasAdminShell
      activePath="/company/integrations"
      eyebrow="Company"
      title="Integrations"
      description="Manage the company email delivery default inherited by restaurants."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <EmailIntegrationForm
        apiPath="/api/company/integrations/email"
        initialSnapshot={emailSnapshot}
      />
      <OAuthIntegrationForm
        apiPath="/api/company/integrations/oauth"
        callbackOrigin={callbackOrigin}
        initialSnapshots={oauthSnapshots}
      />
      <StripeIntegrationForm
        apiPath="/api/company/integrations/stripe"
        backHref="/company"
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}
