import { headers } from "next/headers";

import { auth } from "@/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import { listOrganizationFeatureEntitlements } from "@/lib/feature-entitlements";
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

async function getCustomerFeatureAvailability(organizationId: string) {
  const entitlements = await listOrganizationFeatureEntitlements(organizationId);

  return {
    customerAccountsEnabled:
      entitlements.find(
        (entitlement) => entitlement.key === "ordering.customer_accounts",
      )?.enabled ?? false,
    customerOrderingEnabled:
      entitlements.find(
        (entitlement) => entitlement.key === "ordering.customer",
      )?.enabled ?? false,
    socialLoginEnabled:
      entitlements.find((entitlement) => entitlement.key === "auth.social")
        ?.enabled ?? false,
    stripePaymentsEnabled:
      entitlements.find((entitlement) => entitlement.key === "payments.stripe")
        ?.enabled ?? false,
  };
}

export type PublicOrderUnavailableReason =
  | "MISSING_CONTEXT"
  | "DOMAIN_DISABLED"
  | "CUSTOMER_ORDERING_DISABLED"
  | "CUSTOMER_ACCOUNTS_DISABLED";

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

  const customerFeatures = tenantContext
    ? await getCustomerFeatureAvailability(tenantContext.organizationId).catch(() => ({
        customerAccountsEnabled: false,
        customerOrderingEnabled: false,
        socialLoginEnabled: false,
        stripePaymentsEnabled: false,
      }))
    : {
        customerAccountsEnabled: false,
        customerOrderingEnabled: false,
        socialLoginEnabled: false,
        stripePaymentsEnabled: false,
      };
  const customerOrderingEnabled =
    session?.user.kind === "staff" || customerFeatures.customerOrderingEnabled;
  const customerAccountsEnabled =
    session?.user.kind === "staff" || customerFeatures.customerAccountsEnabled;
  const socialLoginEnabled = customerFeatures.socialLoginEnabled;
  const stripePaymentsEnabled = customerFeatures.stripePaymentsEnabled;

  if (!customerAccountsEnabled) {
    customer = null;
  }

  if (
    tenantContext &&
    customerAccountsEnabled &&
    session?.user.kind === "customer"
  ) {
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

  const [emailIntegration, googleIntegration, appleIntegration, facebookIntegration] =
    tenantContext && customerAccountsEnabled
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
    apple:
      customerAccountsEnabled &&
      socialLoginEnabled &&
      appleIntegration?.status === "CONFIGURED",
    email: Boolean(
      customerAccountsEnabled &&
        process.env.AUTH_SECRET &&
        emailIntegration?.status === "CONFIGURED",
    ),
    facebook:
      customerAccountsEnabled &&
      socialLoginEnabled &&
      facebookIntegration?.status === "CONFIGURED",
    google:
      customerAccountsEnabled &&
      socialLoginEnabled &&
      googleIntegration?.status === "CONFIGURED",
  };

  if (tenantContext) {
    return {
      hasTenantContext: true,
      customerAccountsEnabled,
      customerOrderingEnabled,
      socialLoginEnabled,
      stripePaymentsEnabled,
      customer,
      customerAuthProviders,
      phoneVerificationPolicy,
      restaurantChoices: [],
      tenantContext,
      unavailableReason: !customerOrderingEnabled
        ? ("CUSTOMER_ORDERING_DISABLED" as const)
        : !customerAccountsEnabled
          ? ("CUSTOMER_ACCOUNTS_DISABLED" as const)
          : undefined,
      user,
    };
  }

  if (!requestDomain) {
    return {
      hasTenantContext: false,
      customerAccountsEnabled: false,
      customerOrderingEnabled: false,
      socialLoginEnabled: false,
      stripePaymentsEnabled: false,
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
            restaurants.map(async (restaurant) => {
              const features = await getCustomerFeatureAvailability(
                restaurant.id,
              ).catch(() => ({
                customerAccountsEnabled: false,
                customerOrderingEnabled: false,
                socialLoginEnabled: false,
                stripePaymentsEnabled: false,
              }));

              return {
                enabled:
                  features.customerOrderingEnabled &&
                  features.customerAccountsEnabled,
                restaurant,
              };
            }),
          );

          return availability
            .filter((candidate) => candidate.enabled)
            .map((candidate) => candidate.restaurant);
        })
        .catch(() => [])
    : [];

  return {
    hasTenantContext: false,
    customerAccountsEnabled: false,
    customerOrderingEnabled: false,
    socialLoginEnabled: false,
    stripePaymentsEnabled: false,
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
