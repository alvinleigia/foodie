import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { OAuthIntegrationForm } from "@/components/admin/OAuthIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationOAuthSettingsSnapshots } from "@/lib/organization-oauth-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { getRequestOrigin } from "@/lib/request-origin";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";

export default async function CompanyWorkspaceIntegrationsPage({
  params,
}: CompanyWorkspacePageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "integrations",
  });
  const [callbackOrigin, emailSnapshot, oauthSnapshots, paymentSnapshot, stripePayments] =
    await Promise.all([
      getRequestOrigin(),
      getOrganizationEmailSettingsSnapshot(company.id),
      getOrganizationOAuthSettingsSnapshots(company.id),
      getOrganizationPaymentSettingsSnapshot(company.id),
      getOrganizationFeatureEntitlement(company.id, "payments.stripe"),
    ]);

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "integrations")}
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
        backHref={getCompanyWorkspaceHref(company.slug, "dashboard")}
        enabled={stripePayments.enabled}
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}
