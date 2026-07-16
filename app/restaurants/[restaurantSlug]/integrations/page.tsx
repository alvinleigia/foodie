import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { OAuthIntegrationForm } from "@/components/admin/OAuthIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationOAuthSettingsSnapshots } from "@/lib/organization-oauth-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { getRequestOrigin } from "@/lib/request-origin";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantIntegrationsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      allowedRoles: restaurantAdminRoles,
      destination: "integrations",
      restaurantSlug,
    });
  const [callbackOrigin, emailSnapshot, oauthSnapshots, paymentSnapshot] =
    await Promise.all([
      getRequestOrigin(),
      getOrganizationEmailSettingsSnapshot(snapshot.organization.id),
      getOrganizationOAuthSettingsSnapshots(snapshot.organization.id),
      getOrganizationPaymentSettingsSnapshot(snapshot.organization.id),
    ]);
  const dashboardHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "dashboard",
  );
  const integrationsHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "integrations",
  );

  return (
    <SaasAdminShell
      activePath={integrationsHref}
      eyebrow="Restaurant"
      title="Integrations"
      description="Inherit company email delivery or configure this restaurant separately."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <EmailIntegrationForm
        apiPath="/api/tenant/admin/integrations/email"
        initialSnapshot={emailSnapshot}
      />
      <OAuthIntegrationForm
        apiPath="/api/tenant/admin/integrations/oauth"
        callbackOrigin={callbackOrigin}
        initialSnapshots={oauthSnapshots}
      />
      <StripeIntegrationForm
        apiPath="/api/tenant/admin/integrations/stripe"
        backHref={dashboardHref}
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}

