import { auth } from "@/auth";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orderingPoints, organizations } from "@/db/schema";
import { assertTenantSubscriptionAccess } from "@/lib/billing";
import { isPlatformAdministrationRequest } from "@/lib/deployment-domain";
import { canAccessRole, operationalRoles } from "@/lib/role-access";
import { STAFF_RESTAURANT_QUERY_PARAM } from "@/lib/staff-restaurant-navigation";
import { getTenantContextFromRequestDomain } from "@/lib/tenant-domains";

export type TenantContext = {
  organizationId: string;
  orderingPointId: string | null;
};

export class StaffRestaurantContextError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StaffRestaurantContextError";
    this.status = status;
  }
}

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

export async function getCurrentStaffRestaurantAccess() {
  const session = await auth();

  if (
    session?.user.kind !== "staff" ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, operationalRoles)
  ) {
    return null;
  }

  await assertTenantSubscriptionAccess(session.user.organizationId);

  const db = getDb();
  const [restaurant] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, session.user.organizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!restaurant) {
    return null;
  }

  return {
    restaurant,
    role: session.user.role,
    tenantContext: await getRestaurantContext(restaurant.id),
    user: {
      id: session.user.id,
      name: session.user.name,
    },
  };
}

export async function getActiveStaffRestaurantAccess(restaurantSlug: string) {
  const normalizedSlug = restaurantSlug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const access = await getCurrentStaffRestaurantAccess();

  return access?.restaurant.slug === normalizedSlug ? access : null;
}

export async function getStaffTenantContextFromRequest(request: Request) {
  const restaurantSlug = new URL(request.url).searchParams.get(
    STAFF_RESTAURANT_QUERY_PARAM,
  );

  if (!restaurantSlug) {
    return getCurrentTenantContext();
  }

  if (!isPlatformAdministrationRequest(request)) {
    throw new StaffRestaurantContextError(
      "Staff restaurant access is only available on the platform domain.",
      403,
    );
  }

  const access = await getActiveStaffRestaurantAccess(restaurantSlug);

  if (!access) {
    throw new StaffRestaurantContextError(
      "Your active restaurant changed. Reopen the order page for the selected restaurant.",
      409,
    );
  }

  return access.tenantContext;
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
  const staffRestaurantSlug = url.searchParams.get(STAFF_RESTAURANT_QUERY_PARAM);

  if (staffRestaurantSlug) {
    return getStaffTenantContextFromRequest(request);
  }

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
