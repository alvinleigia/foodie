import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { orderingPoints, organizations, tenantDomains } from "@/db/schema";
import { assertTenantSubscriptionAccess } from "@/lib/billing";
import {
  normalizeDomain,
  ROOT_DOMAIN,
} from "@/lib/deployment-domain";
import type { TenantContext } from "@/lib/tenant-context";

export { normalizeDomain, ROOT_DOMAIN } from "@/lib/deployment-domain";

export function buildCompanySubdomain(companySlug: string) {
  return `${companySlug}.${ROOT_DOMAIN}`.toLowerCase();
}

export function isRootPlatformDomain(domainValue: string | null | undefined) {
  const domain = normalizeDomain(domainValue);

  return Boolean(domain && domain === normalizeDomain(ROOT_DOMAIN));
}

export function getRequestDomain(request: Request) {
  return normalizeDomain(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host,
  );
}

async function resolveRestaurantContext(
  restaurantOrganizationId: string,
): Promise<TenantContext | null> {
  const db = getDb();
  const [restaurant] = await db
    .select({
      organizationId: organizations.id,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, restaurantOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!restaurant) {
    return null;
  }

  const [orderingPoint] = await db
    .select({ id: orderingPoints.id })
    .from(orderingPoints)
    .where(
      and(
        eq(orderingPoints.organizationId, restaurantOrganizationId),
        eq(orderingPoints.isDefault, true),
        eq(orderingPoints.isActive, true),
      ),
    )
    .limit(1);

  return {
    organizationId: restaurant.organizationId,
    orderingPointId: orderingPoint?.id ?? null,
  };
}

async function resolveRestaurantOrderingPoint(
  restaurantOrganizationId: string,
  orderingPointSlug?: string | null,
): Promise<TenantContext | null> {
  const normalizedOrderingPointSlug = orderingPointSlug?.trim().toLowerCase();

  if (!normalizedOrderingPointSlug) {
    return resolveRestaurantContext(restaurantOrganizationId);
  }

  const [record] = await getDb()
    .select({
      organizationId: orderingPoints.organizationId,
      orderingPointId: orderingPoints.id,
    })
    .from(orderingPoints)
    .where(
      and(
        eq(orderingPoints.organizationId, restaurantOrganizationId),
        eq(orderingPoints.isActive, true),
        or(
          eq(orderingPoints.slug, normalizedOrderingPointSlug),
          eq(orderingPoints.qrSlug, normalizedOrderingPointSlug),
        ),
      ),
    )
    .limit(1);

  return record
    ? {
        organizationId: record.organizationId,
        orderingPointId: record.orderingPointId,
      }
    : null;
}

async function resolveCompanyRestaurant(
  companyOrganizationId: string,
  restaurantOrOrderingPointSlug?: string | null,
): Promise<TenantContext | null> {
  const normalizedSlug = restaurantOrOrderingPointSlug?.trim().toLowerCase();
  const db = getDb();

  if (!normalizedSlug) {
    const rows = await db
      .select({
        organizationId: organizations.id,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.parentOrganizationId, companyOrganizationId),
          eq(organizations.type, "RESTAURANT"),
          eq(organizations.isActive, true),
        ),
      )
      .limit(2);

    if (rows.length !== 1) {
      return null;
    }

    return resolveRestaurantContext(rows[0].organizationId);
  }

  const [restaurant] = await db
    .select({ organizationId: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
        eq(organizations.slug, normalizedSlug),
      ),
    )
    .limit(1);

  if (restaurant) {
    return resolveRestaurantContext(restaurant.organizationId);
  }

  const [orderingPoint] = await db
    .select({ organizationId: orderingPoints.organizationId })
    .from(orderingPoints)
    .innerJoin(organizations, eq(organizations.id, orderingPoints.organizationId))
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
        eq(orderingPoints.isActive, true),
        eq(orderingPoints.qrSlug, normalizedSlug),
      ),
    )
    .limit(1);

  return orderingPoint
    ? resolveRestaurantOrderingPoint(orderingPoint.organizationId, normalizedSlug)
    : null;
}

export async function getCompanyDomainRestaurants(
  domainValue: string | null | undefined,
) {
  const domain = normalizeDomain(domainValue);

  if (!domain) {
    return [];
  }

  const [domainRecord] = await getDb()
    .select({ companyOrganizationId: tenantDomains.companyOrganizationId })
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.domain, domain),
        eq(tenantDomains.scope, "COMPANY"),
        eq(tenantDomains.purpose, "ORDERING"),
        eq(tenantDomains.isActive, true),
      ),
    )
    .limit(1);

  if (!domainRecord?.companyOrganizationId) {
    return [];
  }

  return getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, domainRecord.companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .orderBy(organizations.name);
}

export async function getTenantContextFromDomain(
  domain: string | null | undefined,
  routeSlug?: string | null,
): Promise<TenantContext | null> {
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDomain || normalizedDomain === "localhost") {
    return null;
  }

  const [domainRecord] = await getDb()
    .select()
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.domain, normalizedDomain),
        eq(tenantDomains.isActive, true),
        or(
          eq(tenantDomains.purpose, "ORDERING"),
          eq(tenantDomains.purpose, "BOTH"),
        ),
      ),
    )
    .limit(1);

  if (!domainRecord || domainRecord.scope === "PLATFORM") {
    return null;
  }

  let context: TenantContext | null = null;

  if (!context && domainRecord.scope === "RESTAURANT" && domainRecord.restaurantOrganizationId) {
    context = await resolveRestaurantOrderingPoint(
      domainRecord.restaurantOrganizationId,
      routeSlug,
    );
  }

  if (!context && domainRecord.scope === "COMPANY" && domainRecord.companyOrganizationId) {
    context = await resolveCompanyRestaurant(
      domainRecord.companyOrganizationId,
      routeSlug,
    );
  }

  if (!context) {
    return null;
  }

  await assertTenantSubscriptionAccess(context.organizationId);
  return context;
}

export async function getInactiveTenantDomain(domain: string | null | undefined) {
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDomain || normalizedDomain === "localhost" || isRootPlatformDomain(normalizedDomain)) {
    return null;
  }

  const [domainRecord] = await getDb()
    .select({
      domain: tenantDomains.domain,
      scope: tenantDomains.scope,
      purpose: tenantDomains.purpose,
    })
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.domain, normalizedDomain),
        eq(tenantDomains.isActive, false),
      ),
    )
    .limit(1);

  if (!domainRecord || domainRecord.scope === "PLATFORM") {
    return null;
  }

  return domainRecord;
}

export async function getTenantContextFromRequestDomain(
  request: Request,
  routeSlug?: string | null,
) {
  return getTenantContextFromDomain(getRequestDomain(request), routeSlug);
}

export type TenantDomainAccessScope =
  | { type: "PLATFORM" }
  | {
      type: "COMPANY";
      companyOrganizationId: string;
    }
  | {
      type: "RESTAURANT";
      companyOrganizationId: string | null;
      restaurantOrganizationId: string;
    };

export async function getTenantDomainAccessScopeFromDomain(
  domainValue: string | null | undefined,
): Promise<TenantDomainAccessScope> {
  const domain = normalizeDomain(domainValue);

  if (!domain || domain === "localhost" || isRootPlatformDomain(domain)) {
    return { type: "PLATFORM" };
  }

  const [domainRecord] = await getDb()
    .select({
      scope: tenantDomains.scope,
      companyOrganizationId: tenantDomains.companyOrganizationId,
      restaurantOrganizationId: tenantDomains.restaurantOrganizationId,
    })
    .from(tenantDomains)
    .where(and(eq(tenantDomains.domain, domain), eq(tenantDomains.isActive, true)))
    .limit(1);

  if (!domainRecord || domainRecord.scope === "PLATFORM") {
    return { type: "PLATFORM" };
  }

  if (domainRecord.scope === "COMPANY" && domainRecord.companyOrganizationId) {
    return {
      type: "COMPANY",
      companyOrganizationId: domainRecord.companyOrganizationId,
    };
  }

  if (domainRecord.scope === "RESTAURANT" && domainRecord.restaurantOrganizationId) {
    const [restaurant] = await getDb()
      .select({
        companyOrganizationId: organizations.parentOrganizationId,
      })
      .from(organizations)
      .where(eq(organizations.id, domainRecord.restaurantOrganizationId))
      .limit(1);

    return {
      type: "RESTAURANT",
      companyOrganizationId: restaurant?.companyOrganizationId ?? null,
      restaurantOrganizationId: domainRecord.restaurantOrganizationId,
    };
  }

  return { type: "PLATFORM" };
}

export async function getTenantDomainAccessScopeFromRequest(
  request: Request,
): Promise<TenantDomainAccessScope> {
  return getTenantDomainAccessScopeFromDomain(getRequestDomain(request));
}
