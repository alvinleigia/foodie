import { auth } from "@/auth";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orderingPoints, organizations } from "@/db/schema";
import { assertTenantSubscriptionAccess } from "@/lib/billing";
import { getTenantContextFromRequestDomain } from "@/lib/tenant-domains";

export type TenantContext = {
  organizationId: string;
  orderingPointId: string | null;
};

export function getDefaultTenantContext(): TenantContext {
  throw new Error("Tenant context is required. Use a restaurant link or signed-in restaurant access.");
}

async function getRestaurantContext(organizationId: string): Promise<TenantContext> {
  const db = getDb();
  const [restaurant] = await db
    .select({
      organizationId: organizations.id,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!restaurant) {
    throw new Error("Signed-in user is missing restaurant access.");
  }

  const [orderingPoint] = await db
    .select({ id: orderingPoints.id })
    .from(orderingPoints)
    .where(
      and(
        eq(orderingPoints.organizationId, organizationId),
        eq(orderingPoints.isDefault, true),
        eq(orderingPoints.isActive, true),
      ),
    )
    .orderBy(asc(orderingPoints.createdAt), asc(orderingPoints.id))
    .limit(1);

  return {
    organizationId: restaurant.organizationId,
    orderingPointId: orderingPoint?.id ?? null,
  };
}

export async function getCurrentTenantContext() {
  const session = await auth();

  if (session?.user.kind === "staff" && session.user.organizationId) {
    await assertTenantSubscriptionAccess(session.user.organizationId);

    return getRestaurantContext(session.user.organizationId);
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
      organizationId: orderingPoints.organizationId,
      orderingPointId: orderingPoints.id,
    })
    .from(orderingPoints)
    .innerJoin(organizations, eq(organizations.id, orderingPoints.organizationId))
    .where(
      and(
        eq(orderingPoints.qrSlug, normalizedQrSlug),
        eq(orderingPoints.isActive, true),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    );

  if (!record) {
    throw new Error("Invalid order QR link.");
  }

  await assertTenantSubscriptionAccess(record.organizationId);

  return {
    organizationId: record.organizationId,
    orderingPointId: record.orderingPointId,
  };
}

export async function getPublicTenantContextFromRequest(request: Request) {
  const url = new URL(request.url);
  const qrSlug = url.searchParams.get("qr");

  if (qrSlug) {
    return getTenantContextFromQrSlug(qrSlug);
  }

  const routeSlug = url.searchParams.get("route");
  const domainContext = await getTenantContextFromRequestDomain(request, routeSlug);

  if (domainContext) {
    return domainContext;
  }

  const session = await auth();

  if (session?.user.kind === "staff" && session.user.organizationId) {
    await assertTenantSubscriptionAccess(session.user.organizationId);

    return getRestaurantContext(session.user.organizationId);
  }

  if (session?.user.kind === "staff") {
    throw new Error("Signed-in user is missing restaurant access.");
  }

  return getDefaultTenantContext();
}
