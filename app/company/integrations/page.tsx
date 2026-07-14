import { redirect } from "next/navigation";

import { EmailIntegrationForm } from "@/components/admin/EmailIntegrationForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { requireRole } from "@/lib/auth";
import { getOrganizationEmailSettingsSnapshot } from "@/lib/organization-email-settings";
import { companyAdminRoles } from "@/lib/role-access";

export default async function CompanyIntegrationsPage() {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    redirect("/staff/login");
  }

  const snapshot = await getOrganizationEmailSettingsSnapshot(
    session.user.organizationId,
  );

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
        backHref="/company"
        initialSnapshot={snapshot}
      />
    </SaasAdminShell>
  );
}
