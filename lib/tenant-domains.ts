import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, organizations, tenantDomains } from "@/db/schema";
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

async function resolveSingleActiveLocation(
  restaurantOrganizationId: string,
): Promise<TenantContext | null> {
  const rows = await getDb()
    .select({
      organizationId: locations.organizationId,
      locationId: locations.id,
    })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, restaurantOrganizationId),
        eq(locations.isActive, true),
      ),
    )
    .limit(2);

  if (rows.length !== 1) {
    return null;
  }

  return {
    organizationId: rows[0].organizationId,
    locationId: rows[0].locationId,
  };
}

async function resolveRestaurantLocation(
  restaurantOrganizationId: string,
  locationSlug?: string | null,
): Promise<TenantContext | null> {
  const normalizedLocationSlug = locationSlug?.trim().toLowerCase();

  if (!normalizedLocationSlug) {
    return resolveSingleActiveLocation(restaurantOrganizationId);
  }

  const [record] = await getDb()
    .select({
      organizationId: locations.organizationId,
      locationId: locations.id,
    })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, restaurantOrganizationId),
        eq(locations.isActive, true),
        or(
          eq(locations.slug, normalizedLocationSlug),
          eq(locations.qrSlug, normalizedLocationSlug),
        ),
      ),
    )
    .limit(1);

  return record
    ? {
        organizationId: record.organizationId,
        locationId: record.locationId,
      }
    : null;
}

async function resolveCompanyLocation(
  companyOrganizationId: string,
  locationSlug?: string | null,
): Promise<TenantContext | null> {
  const normalizedLocationSlug = locationSlug?.trim().toLowerCase();
  const db = getDb();

  if (!normalizedLocationSlug) {
    const rows = await db
      .select({
        organizationId: locations.organizationId,
        locationId: locations.id,
      })
      .from(locations)
      .innerJoin(organizations, eq(organizations.id, locations.organizationId))
      .where(
        and(
          eq(organizations.parentOrganizationId, companyOrganizationId),
          eq(organizations.type, "RESTAURANT"),
          eq(organizations.isActive, true),
          eq(locations.isActive, true),
        ),
      )
      .limit(2);

    if (rows.length !== 1) {
      return null;
    }

    return {
      organizationId: rows[0].organizationId,
      locationId: rows[0].locationId,
    };
  }

  const [record] = await db
    .select({
      organizationId: locations.organizationId,
      locationId: locations.id,
    })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
        eq(locations.isActive, true),
        or(
          eq(locations.slug, normalizedLocationSlug),
          eq(locations.qrSlug, normalizedLocationSlug),
        ),
      ),
    )
    .limit(1);

  return record
    ? {
        organizationId: record.organizationId,
        locationId: record.locationId,
      }
    : null;
}

export async function getTenantContextFromDomain(
  domain: string | null | undefined,
  locationSlug?: string | null,
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
      ),
    )
    .limit(1);

  if (!domainRecord || domainRecord.scope === "PLATFORM") {
    return null;
  }

  let context: TenantContext | null = null;

  if (domainRecord.scope === "LOCATION" && domainRecord.locationId) {
    const [record] = await getDb()
      .select({
        organizationId: locations.organizationId,
        locationId: locations.id,
      })
      .from(locations)
      .innerJoin(organizations, eq(organizations.id, locations.organizationId))
      .where(
        and(
          eq(locations.id, domainRecord.locationId),
          eq(locations.isActive, true),
          eq(organizations.isActive, true),
        ),
      )
      .limit(1);

    context = record
      ? {
          organizationId: record.organizationId,
          locationId: record.locationId,
        }
      : null;
  }

  if (!context && domainRecord.scope === "RESTAURANT" && domainRecord.restaurantOrganizationId) {
    context = await resolveRestaurantLocation(
      domainRecord.restaurantOrganizationId,
      locationSlug,
    );
  }

  if (!context && domainRecord.scope === "COMPANY" && domainRecord.companyOrganizationId) {
    context = await resolveCompanyLocation(
      domainRecord.companyOrganizationId,
      locationSlug,
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
  locationSlug?: string | null,
) {
  return getTenantContextFromDomain(getRequestDomain(request), locationSlug);
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
    }
  | {
      type: "LOCATION";
      companyOrganizationId: string | null;
      restaurantOrganizationId: string;
      locationId: string;
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
      locationId: tenantDomains.locationId,
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

  if (domainRecord.scope === "LOCATION" && domainRecord.locationId) {
    const [location] = await getDb()
      .select({
        restaurantOrganizationId: locations.organizationId,
        companyOrganizationId: organizations.parentOrganizationId,
      })
      .from(locations)
      .innerJoin(organizations, eq(organizations.id, locations.organizationId))
      .where(eq(locations.id, domainRecord.locationId))
      .limit(1);

    if (location) {
      return {
        type: "LOCATION",
        companyOrganizationId: location.companyOrganizationId,
        restaurantOrganizationId: location.restaurantOrganizationId,
        locationId: domainRecord.locationId,
      };
    }
  }

  return { type: "PLATFORM" };
}

export async function getTenantDomainAccessScopeFromRequest(
  request: Request,
): Promise<TenantDomainAccessScope> {
  return getTenantDomainAccessScopeFromDomain(getRequestDomain(request));
}
