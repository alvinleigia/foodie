import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth, unstable_update } from "@/auth";
import { getMembershipAccessOptions } from "@/lib/location-access";
import { getHomePathForRole } from "@/lib/role-access";
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
      (membership.locationId ?? "") === session.user.locationId &&
      membership.role === session.user.role,
  );

  if (!activeMembershipIsAllowed && allowedMemberships[0]) {
    await unstable_update({
      user: {
        membershipId: allowedMemberships[0].membershipId,
      },
    });

    redirect(getHomePathForRole(allowedMemberships[0].role));
  }

  redirect(getHomePathForRole(session.user.role));
}
