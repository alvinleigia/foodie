import { headers } from "next/headers";

import { auth } from "@/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import {
  getCompanyDomainRestaurants,
  getInactiveTenantDomain,
  getTenantContextFromDomain,
} from "@/lib/tenant-domains";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import { resolveOrganizationOAuthIntegration } from "@/lib/organization-oauth-settings";
import { getCustomerPhoneVerificationPolicy } from "@/lib/phone-verification-policy";
import type { MembershipRole } from "@/lib/staff-auth";
import {
  getCurrentTenantContext,
  getTenantContextFromQrSlug,
} from "@/lib/tenant-context";

type PublicOrderRouteOptions = {
  orderingPointQrSlug?: string;
  routeSlug?: string;
};

export type PublicOrderUnavailableReason =
  | "MISSING_CONTEXT"
  | "DOMAIN_DISABLED"
  | "CUSTOMER_ORDERING_DISABLED";

export async function getPublicOrderRouteContext({
  orderingPointQrSlug,
  routeSlug,
}: PublicOrderRouteOptions) {
  const phoneVerificationPolicy = getCustomerPhoneVerificationPolicy();
  const session = await auth().catch(() => null);
  const user =
    session?.user.kind === "staff"
      ? {
          name: session.user.name,
          role: session.user.role as MembershipRole,
        }
      : null;
  let customer =
    session?.user.kind === "customer"
      ? {
          email: session.user.email,
          name: session.user.name,
          phone: null as string | null,
          phoneVerifiedAt: null as string | null,
        }
      : null;
  const hasSignedRestaurantAccess = Boolean(
    session?.user.kind === "staff" &&
      session.user.organizationId,
  );

  const requestHeaders = await headers();
  const requestDomain =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantContext = orderingPointQrSlug
    ? await getTenantContextFromQrSlug(orderingPointQrSlug).catch(() => null)
    : hasSignedRestaurantAccess && session?.user.kind === "staff"
      ? await getCurrentTenantContext().catch(() => null)
      : requestDomain
        ? await getTenantContextFromDomain(requestDomain, routeSlug).catch(() => null)
        : null;

  if (tenantContext && session?.user.kind === "customer") {
    const customerProfile = await getCustomerProfile(
      session.user.id,
      tenantContext,
    ).catch(() => null);

    customer = {
      email: customerProfile?.email ?? session.user.email,
      name: customerProfile?.name ?? session.user.name,
      phone: customerProfile?.phone ?? null,
      phoneVerifiedAt: customerProfile?.phoneVerifiedAt?.toISOString() ?? null,
    };
  }

  const customerOrderingEnabled = tenantContext
    ? session?.user.kind === "staff" ||
      (await getOrganizationFeatureEntitlement(
        tenantContext.organizationId,
        "ordering.customer",
      )
        .then((entitlement) => entitlement.enabled)
        .catch(() => false))
    : false;

  const [emailIntegration, googleIntegration, appleIntegration, facebookIntegration] =
    tenantContext
      ? await Promise.all([
          resolveOrganizationEmailIntegration(tenantContext.organizationId).catch(
            () => null,
          ),
          resolveOrganizationOAuthIntegration(
            tenantContext.organizationId,
            "GOOGLE",
          ).catch(() => null),
          resolveOrganizationOAuthIntegration(
            tenantContext.organizationId,
            "APPLE",
          ).catch(() => null),
          resolveOrganizationOAuthIntegration(
            tenantContext.organizationId,
            "FACEBOOK",
          ).catch(() => null),
        ])
      : [null, null, null, null];
  const customerAuthProviders = {
    apple: appleIntegration?.status === "CONFIGURED",
    email: Boolean(process.env.AUTH_SECRET && emailIntegration?.status === "CONFIGURED"),
    facebook: facebookIntegration?.status === "CONFIGURED",
    google: googleIntegration?.status === "CONFIGURED",
  };

  if (tenantContext) {
    return {
      hasTenantContext: true,
      customerOrderingEnabled,
      customer,
      customerAuthProviders,
      phoneVerificationPolicy,
      restaurantChoices: [],
      tenantContext,
      unavailableReason: customerOrderingEnabled
        ? undefined
        : ("CUSTOMER_ORDERING_DISABLED" as const),
      user,
    };
  }

  if (!requestDomain) {
    return {
      hasTenantContext: false,
      customerOrderingEnabled: false,
      customer,
      customerAuthProviders,
      phoneVerificationPolicy,
      restaurantChoices: [],
      tenantContext: null,
      unavailableReason: "MISSING_CONTEXT" as const,
      user,
    };
  }

  const restaurantChoices = !orderingPointQrSlug && !routeSlug
    ? await getCompanyDomainRestaurants(requestDomain)
        .then(async (restaurants) => {
          const availability = await Promise.all(
            restaurants.map(async (restaurant) => ({
              enabled: await getOrganizationFeatureEntitlement(
                restaurant.id,
                "ordering.customer",
              )
                .then((entitlement) => entitlement.enabled)
                .catch(() => false),
              restaurant,
            })),
          );

          return availability
            .filter((candidate) => candidate.enabled)
            .map((candidate) => candidate.restaurant);
        })
        .catch(() => [])
    : [];

  return {
    hasTenantContext: false,
    customerOrderingEnabled: false,
    customer,
    customerAuthProviders,
    phoneVerificationPolicy,
    restaurantChoices,
    tenantContext: null,
    unavailableReason: (await getInactiveTenantDomain(requestDomain).catch(() => null))
      ? ("DOMAIN_DISABLED" as const)
      : ("MISSING_CONTEXT" as const),
    user,
  };
}
