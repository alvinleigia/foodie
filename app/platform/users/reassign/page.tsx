import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ReassignExistingUserForm } from "@/components/admin/ReassignExistingUserForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import {
  listPlatformReassignableUsers,
  listPlatformReassignmentTargets,
} from "@/lib/saas-admin";

function getSafeReturnTo(value: string | string[] | undefined) {
  const returnTo = Array.isArray(value) ? value[0] : value;

  if (
    returnTo === "/platform/companies" ||
    returnTo === "/platform/users/memberships"
  ) {
    return returnTo;
  }

  return "/platform/users/memberships";
}

export default async function ReassignPlatformUserPage(
  props: PageProps<"/platform/users/reassign">,
) {
  const session = await auth();

  if (!session?.user?.role || !canAccessRole(session.user.role, platformAdminRoles)) {
    redirect("/staff/login");
  }

  const [targets, users] = await Promise.all([
    listPlatformReassignmentTargets(),
    listPlatformReassignableUsers(),
  ]);
  const searchParams = await props.searchParams;
  const backHref = getSafeReturnTo(searchParams.returnTo);

  return (
    <SaasAdminShell
      activePath="/platform/users/reassign"
      eyebrow="Platform"
      title="Reassign user"
      description="Move an existing user's future access to another company or location."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <ReassignExistingUserForm backHref={backHref} targets={targets} users={users} />
    </SaasAdminShell>
  );
}
