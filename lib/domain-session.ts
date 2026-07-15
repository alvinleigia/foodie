import { headers } from "next/headers";

import { isPlatformAdministrationDomain } from "@/lib/deployment-domain";
import { getMembershipAccessOptions } from "@/lib/membership-access";
import type { MembershipRole } from "@/lib/staff-auth";

type SessionAccessUser = {
  id: string;
  organizationId: string;
  role: MembershipRole;
};

export async function isCurrentRequestPlatformAdministrationDomain() {
  const requestHeaders = await headers();

  return isPlatformAdministrationDomain(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
}

export async function isSessionAccessAllowedForCurrentDomain(
  user: SessionAccessUser,
) {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    return false;
  }

  const allowedMemberships = await getMembershipAccessOptions(user.id, {
    type: "PLATFORM",
  });

  return allowedMemberships.some(
    (membership) =>
      membership.organizationId === user.organizationId && membership.role === user.role,
  );
}
