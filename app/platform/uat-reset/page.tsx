import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { UatDatabaseResetForm } from "@/components/admin/UatDatabaseResetForm";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { isUatDatabaseResetEnabled } from "@/lib/uat-reset";

export const dynamic = "force-dynamic";

export default async function PlatformUatResetPage() {
  if (!isUatDatabaseResetEnabled()) {
    notFound();
  }

  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  return (
    <SaasAdminShell
      activePath="/platform/uat-reset"
      eyebrow="Platform"
      title="UAT database reset"
      description="Clear testing data and return to a clean SaaS owner-only state."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <UatDatabaseResetForm backHref="/platform" />
    </SaasAdminShell>
  );
}
