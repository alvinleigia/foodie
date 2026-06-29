import { and, eq, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, memberships, organizations, users } from "@/db/schema";
import { getTenantSubscriptionAccess } from "@/lib/billing";
import { verifyPassword } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";

export type MembershipRole =
  | "PLATFORM_ADMIN"
  | "COMPANY_OWNER"
  | "COMPANY_MANAGER"
  | "RESTAURANT_MANAGER"
  | "ORDER_OPERATOR";

export type StaffPrincipal = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: MembershipRole;
  organizationId: string;
  locationId: string;
};

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function authenticateStaff(
  identifierValue: unknown,
  passwordValue: unknown,
) {
  const identifier = normalizeIdentifier(identifierValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!identifier || !password) {
    return null;
  }

  const loginRateLimit = checkRateLimit({
    key: `auth:credentials:${identifier}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });

  if (!loginRateLimit.allowed) {
    return null;
  }

  const db = getDb();
  const [record] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      passwordHash: users.passwordHash,
      status: users.status,
      membershipRole: memberships.role,
      organizationId: memberships.organizationId,
      organizationType: organizations.type,
      locationId: memberships.locationId,
      membershipActive: memberships.isActive,
      organizationActive: organizations.isActive,
      locationActive: locations.isActive,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      and(
        or(eq(users.username, identifier), eq(users.email, identifier)),
        eq(users.status, "ACTIVE"),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
        or(isNull(memberships.locationId), eq(locations.isActive, true)),
      ),
    )
    .limit(1);

  if (!record) {
    return null;
  }

  const isValidPassword = await verifyPassword(password, record.passwordHash);

  if (!isValidPassword) {
    return null;
  }

  if (record.organizationType !== "PLATFORM") {
    const commercialAccess = await getTenantSubscriptionAccess(record.organizationId);

    if (!commercialAccess.allowed) {
      return null;
    }
  }

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    username: record.username,
    role: record.membershipRole,
    organizationId: record.organizationId,
    locationId: record.locationId ?? "",
  } satisfies StaffPrincipal;
}
