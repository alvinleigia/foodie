import { notFound, redirect } from "next/navigation";

import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StripeIntegrationForm } from "@/components/admin/StripeIntegrationForm";
import { requireRole } from "@/lib/auth";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { getOrganizationPaymentSettingsSnapshot } from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant } from "@/lib/saas-admin";

export default async function CompanyRestaurantIntegrationsPage(
  props: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const restaurant = await getCompanyRestaurant(session.user.organizationId, id);

  if (!restaurant) {
    notFound();
  }

  const [emailSnapshot, paymentSnapshot] = await Promise.all([
    getOrganizationEmailSettingsSnapshot(restaurant.id),
    getOrganizationPaymentSettingsSnapshot(restaurant.id),
  ]);

  return (
    <SaasAdminShell
      activePath="/company/restaurants"
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
      <StripeIntegrationForm
        apiPath={`/api/company/restaurants/${restaurant.id}/integrations/stripe`}
        backHref={`/company/restaurants/${restaurant.id}`}
        initialSnapshot={paymentSnapshot}
      />
    </SaasAdminShell>
  );
}
