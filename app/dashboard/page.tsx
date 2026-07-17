import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { getMembershipAccessOptions } from "@/lib/membership-access";
import { getHomePathForRole } from "@/lib/role-access";
import { resolveStaffHomePath } from "@/lib/staff-home";
import { getTenantDomainAccessScopeFromDomain } from "@/lib/tenant-domains";

export default async function DashboardRedirectPage() {
  const session = await auth();

  if (!session?.user?.id || !session.user.role) {
    redirect("/staff/login");
  }

  const requestHeaders = await headers();
  const accessScope = await getTenantDomainAccessScopeFromDomain(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const allowedMemberships = await getMembershipAccessOptions(
    session.user.id,
    accessScope,
  );
  const activeMembershipIsAllowed = allowedMemberships.some(
    (membership) =>
      membership.organizationId === session.user.organizationId &&
      membership.role === session.user.role,
  );

  if (!activeMembershipIsAllowed && allowedMemberships[0]) {
    redirect(
      `/api/session/memberships/activate?membershipId=${allowedMemberships[0].membershipId}`,
    );
  }

  redirect(
    (await resolveStaffHomePath(session.user)) ??
      getHomePathForRole(session.user.role),
  );
}
