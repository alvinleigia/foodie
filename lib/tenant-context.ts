import { auth } from "@/auth";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, organizations } from "@/db/schema";
import { assertTenantSubscriptionAccess } from "@/lib/billing";
import { getTenantContextFromRequestDomain } from "@/lib/tenant-domains";

export type TenantContext = {
  organizationId: string;
  locationId: string;
};

export function getDefaultTenantContext(): TenantContext {
  throw new Error("Tenant context is required. Use a restaurant link or signed-in restaurant access.");
}

async function getRestaurantCompatibilityContext(organizationId: string) {
  const [record] = await getDb()
    .select({
      organizationId: locations.organizationId,
      locationId: locations.id,
    })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.isActive, true),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .orderBy(asc(locations.createdAt), asc(locations.id))
    .limit(1);

  if (!record) {
    throw new Error("Signed-in user is missing restaurant access.");
  }

  return record;
}

export async function getCurrentTenantContext() {
  const session = await auth();

  if (session?.user.kind === "staff" && session.user.organizationId) {
    await assertTenantSubscriptionAccess(session.user.organizationId);

    return session.user.locationId
      ? {
          organizationId: session.user.organizationId,
          locationId: session.user.locationId,
        }
      : getRestaurantCompatibilityContext(session.user.organizationId);
  }

  if (session?.user.kind === "staff") {
    throw new Error("Signed-in user is missing restaurant access.");
  }

  return getDefaultTenantContext();
}

export async function getTenantContextFromQrSlug(qrSlug: string) {
  const normalizedQrSlug = qrSlug.trim().toLowerCase();

  if (!normalizedQrSlug) {
    throw new Error("Invalid order QR link.");
  }

  const db = getDb();
  const [record] = await db
    .select({
      organizationId: locations.organizationId,
      locationId: locations.id,
    })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(
      and(
        eq(locations.qrSlug, normalizedQrSlug),
        eq(locations.isActive, true),
        eq(organizations.isActive, true),
      ),
    );

  if (!record) {
    throw new Error("Invalid order QR link.");
  }

  await assertTenantSubscriptionAccess(record.organizationId);

  return {
    organizationId: record.organizationId,
    locationId: record.locationId,
  };
}

export async function getPublicTenantContextFromRequest(request: Request) {
  const url = new URL(request.url);
  const qrSlug = url.searchParams.get("qr");

  if (qrSlug) {
    return getTenantContextFromQrSlug(qrSlug);
  }

  const locationSlug = url.searchParams.get("location");
  const domainContext = await getTenantContextFromRequestDomain(request, locationSlug);

  if (domainContext) {
    return domainContext;
  }

  const session = await auth();

  if (session?.user.kind === "staff" && session.user.organizationId) {
    await assertTenantSubscriptionAccess(session.user.organizationId);

    return session.user.locationId
      ? {
          organizationId: session.user.organizationId,
          locationId: session.user.locationId,
        }
      : getRestaurantCompatibilityContext(session.user.organizationId);
  }

  if (session?.user.kind === "staff") {
    throw new Error("Signed-in user is missing restaurant access.");
  }

  return getDefaultTenantContext();
}
