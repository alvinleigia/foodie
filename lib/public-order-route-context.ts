import { headers } from "next/headers";

import { auth } from "@/auth";
import {
  getInactiveTenantDomain,
  getTenantContextFromDomain,
} from "@/lib/tenant-domains";
import type { MembershipRole } from "@/lib/staff-auth";

type PublicOrderRouteOptions = {
  locationQrSlug?: string;
  locationSlug?: string;
};

export type PublicOrderUnavailableReason = "MISSING_CONTEXT" | "DOMAIN_DISABLED";

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
      unavailableReason: "MISSING_CONTEXT" as const,
      user,
    };
  }

  const domainContext = await getTenantContextFromDomain(
    requestDomain,
    locationSlug,
  ).catch(() => null);

  return {
    hasTenantContext: Boolean(domainContext),
    unavailableReason: domainContext
      ? undefined
      : (await getInactiveTenantDomain(requestDomain).catch(() => null))
        ? ("DOMAIN_DISABLED" as const)
        : ("MISSING_CONTEXT" as const),
    user,
  };
}
