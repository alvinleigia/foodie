import { headers } from "next/headers";

import { auth } from "@/auth";
import { getTenantContextFromDomain } from "@/lib/tenant-domains";
import type { MembershipRole } from "@/lib/staff-auth";

type PublicOrderRouteOptions = {
  locationQrSlug?: string;
  locationSlug?: string;
};

export async function getPublicOrderRouteContext({
  locationQrSlug,
  locationSlug,
}: PublicOrderRouteOptions) {
  const session = await auth().catch(() => null);
  const user = session?.user?.role
    ? {
        name: session.user.name,
        role: session.user.role as MembershipRole,
      }
    : null;
  const hasSignedLocationAccess = Boolean(
    session?.user.organizationId && session.user.locationId,
  );

  if (locationQrSlug || hasSignedLocationAccess) {
    return {
      hasTenantContext: true,
      user,
    };
  }

  const requestHeaders = await headers();
  const requestDomain =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!requestDomain) {
    return {
      hasTenantContext: false,
      user,
    };
  }

  const domainContext = await getTenantContextFromDomain(
    requestDomain,
    locationSlug,
  ).catch(() => null);

  return {
    hasTenantContext: Boolean(domainContext),
    user,
  };
}
