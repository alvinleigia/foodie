import { headers } from "next/headers";

import { auth } from "@/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import {
  getInactiveTenantDomain,
  getTenantContextFromDomain,
} from "@/lib/tenant-domains";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import type { MembershipRole } from "@/lib/staff-auth";
import { getTenantContextFromQrSlug } from "@/lib/tenant-context";

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
  const user =
    session?.user.kind === "staff"
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
  const hasSignedLocationAccess = Boolean(
    session?.user.kind === "staff" &&
      session.user.organizationId &&
      session.user.locationId,
  );

  const requestHeaders = await headers();
  const requestDomain =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantContext = locationQrSlug
    ? await getTenantContextFromQrSlug(locationQrSlug).catch(() => null)
    : hasSignedLocationAccess && session?.user.kind === "staff"
      ? {
          organizationId: session.user.organizationId!,
          locationId: session.user.locationId!,
        }
      : requestDomain
        ? await getTenantContextFromDomain(requestDomain, locationSlug).catch(() => null)
        : null;
  const emailIntegration = tenantContext
    ? await resolveOrganizationEmailIntegration(tenantContext.organizationId).catch(
        () => null,
      )
    : null;
  const customerAuthProviders = {
    apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
    email: Boolean(process.env.AUTH_SECRET && emailIntegration?.status === "CONFIGURED"),
    facebook: Boolean(
      process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET,
    ),
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  };

  if (tenantContext) {
    return {
      hasTenantContext: true,
      customer,
      customerAuthProviders,
      user,
    };
  }

  if (!requestDomain) {
    return {
      hasTenantContext: false,
      customer,
      customerAuthProviders,
      unavailableReason: "MISSING_CONTEXT" as const,
      user,
    };
  }

  return {
    hasTenantContext: false,
    customer,
    customerAuthProviders,
    unavailableReason: (await getInactiveTenantDomain(requestDomain).catch(() => null))
      ? ("DOMAIN_DISABLED" as const)
      : ("MISSING_CONTEXT" as const),
    user,
  };
}
