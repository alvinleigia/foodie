import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { OAuthIntegrationForm } from "@/components/admin/OAuthIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import {
  getCompanyRestaurantHref,
  getCompanyWorkspaceHref,
} from "@/lib/company-workspace";
import { requireCompanyRestaurantWorkspaceAccess } from "@/lib/company-workspace-access";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationOAuthSettingsSnapshots } from "@/lib/organization-oauth-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { getRequestOrigin } from "@/lib/request-origin";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";

type CompanyRestaurantIntegrationsPageProps = {
  params: Promise<{ companySlug: string; restaurantSlug: string }>;
};

export default async function CompanyWorkspaceRestaurantIntegrationsPage({
  params,
}: CompanyRestaurantIntegrationsPageProps) {
  const { companySlug, restaurantSlug } = await params;
  const { company, restaurant, session } =
    await requireCompanyRestaurantWorkspaceAccess({
      companySlug,
      restaurantSlug,
    });
  const [callbackOrigin, emailSnapshot, oauthSnapshots, paymentSnapshot, stripePayments] =
    await Promise.all([
      getRequestOrigin(),
      getOrganizationEmailSettingsSnapshot(restaurant.id),
      getOrganizationOAuthSettingsSnapshots(restaurant.id),
      getOrganizationPaymentSettingsSnapshot(restaurant.id),
      getOrganizationFeatureEntitlement(restaurant.id, "payments.stripe"),
    ]);

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title={`${restaurant.name} integrations`}
      description="Choose whether this restaurant inherits company delivery or uses its own sender."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <EmailIntegrationForm
        apiPath={`/api/company/restaurants/${restaurant.id}/integrations/email`}
        initialSnapshot={emailSnapshot}
      />
      <OAuthIntegrationForm
        apiPath={`/api/company/restaurants/${restaurant.id}/integrations/oauth`}
        callbackOrigin={callbackOrigin}
        initialSnapshots={oauthSnapshots}
      />
      <StripeIntegrationForm
        apiPath={`/api/company/restaurants/${restaurant.id}/integrations/stripe`}
        backHref={getCompanyRestaurantHref(
          company.slug,
          restaurant.slug,
          "settings",
        )}
        enabled={stripePayments.enabled}
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}
