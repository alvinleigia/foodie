import { headers } from "next/headers";

import { auth } from "@/auth";
import { getCustomerProfile } from "@/lib/customer-account";
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
  const customerProfile =
    session?.user.kind === "customer"
      ? await getCustomerProfile(session.user.id).catch(() => null)
      : null;
  const user = session?.user.kind === "staff"
    ? {
        name: session.user.name,
        role: session.user.role as MembershipRole,
      }
    : null;
  const customer =
    session?.user.kind === "customer"
      ? {
          email: customerProfile?.email ?? session.user.email,
          name: customerProfile?.name ?? session.user.name,
          phone: customerProfile?.phone ?? null,
        }
      : null;
  const customerAuthProviders = {
    apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
    email: Boolean(
      process.env.AUTH_SECRET && process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
    ),
    facebook: Boolean(
      process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET,
    ),
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  };
  const hasSignedLocationAccess = Boolean(
    session?.user.kind === "staff" &&
      session.user.organizationId &&
      session.user.locationId,
  );

  if (locationQrSlug || hasSignedLocationAccess) {
    return {
      hasTenantContext: true,
      customer,
      customerAuthProviders,
      user,
    };
  }

  const requestHeaders = await headers();
  const requestDomain =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!requestDomain) {
    return {
      hasTenantContext: false,
      customer,
      customerAuthProviders,
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
    customer,
    customerAuthProviders,
    unavailableReason: domainContext
      ? undefined
      : (await getInactiveTenantDomain(requestDomain).catch(() => null))
        ? ("DOMAIN_DISABLED" as const)
        : ("MISSING_CONTEXT" as const),
    user,
  };
}
