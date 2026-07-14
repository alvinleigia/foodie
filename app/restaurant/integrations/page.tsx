import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantIntegrationsPage() {
  const { session, snapshot: tenantSnapshot } = await requireRestaurantAdminPage();
  const [emailSnapshot, paymentSnapshot] = await Promise.all([
    getOrganizationEmailSettingsSnapshot(tenantSnapshot.organization.id),
    getOrganizationPaymentSettingsSnapshot(tenantSnapshot.organization.id),
  ]);

  return (
    <SaasAdminShell
      activePath="/restaurant/integrations"
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
      <StripeIntegrationForm
        apiPath="/api/tenant/admin/integrations/stripe"
        backHref="/restaurant"
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}
