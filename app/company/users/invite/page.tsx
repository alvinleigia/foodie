import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";

export default async function CompanyUserInvitePage() {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/company/users"
      eyebrow="Company"
      title="Invite company user"
      description="Create a one-time invite link for this company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <StaffInviteForm
        apiPath="/api/company/users/invite"
        assignExistingHref={`/company/users/reassign?role=COMPANY_MANAGER&returnTo=${encodeURIComponent("/company/users")}`}
        backHref="/company/users"
        defaultRole="COMPANY_MANAGER"
        description="Company users can manage restaurants and reporting based on their role."
        roles={[
          { label: "Company Owner", value: "COMPANY_OWNER" },
          { label: "Company Manager", value: "COMPANY_MANAGER" },
        ]}
        title="Invite user"
      />
    </SaasAdminShell>
  );
}
