import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { getTenantSubscriptionAccess } from "@/lib/billing";
import {
  isMembershipAllowedInScope,
  type ScopedMembershipAccess,
} from "@/lib/membership-access";
import { verifyPassword } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";
import type { TenantDomainAccessScope } from "@/lib/tenant-domains";

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
};

export type StaffAccessCandidate = StaffPrincipal & {
  organizationSlug: string;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
};

type AuthenticateStaffOptions = {
  platformOnly?: boolean;
  accessScope?: TenantDomainAccessScope;
};

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getScopedAccessPriority(
  record: ScopedMembershipAccess,
  scope?: TenantDomainAccessScope,
) {
  if (!scope || scope.type === "PLATFORM") {
    return 0;
  }

  if (scope.type === "COMPANY") {
    return record.organizationType === "COMPANY" ? 0 : 1;
  }

  if (scope.type === "RESTAURANT") {
    return record.organizationId === scope.restaurantOrganizationId ? 0 : 1;
  }

  return 1;
}

async function resolveStaffAccessRecord(
  identifier: string,
  options: AuthenticateStaffOptions,
) {
  const db = getDb();
  const baseAccessCondition = and(
    or(eq(users.username, identifier), eq(users.email, identifier)),
    eq(users.status, "ACTIVE"),
    eq(memberships.isActive, true),
    eq(organizations.isActive, true),
  );
  const records = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      passwordHash: users.passwordHash,
      status: users.status,
      membershipRole: memberships.role,
      organizationId: memberships.organizationId,
      organizationSlug: organizations.slug,
      organizationType: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
      membershipActive: memberships.isActive,
      organizationActive: organizations.isActive,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      options.platformOnly
        ? and(
            baseAccessCondition,
            eq(memberships.role, "PLATFORM_ADMIN"),
            eq(organizations.type, "PLATFORM"),
          )
        : baseAccessCondition,
    );

  return (
    records
      .filter(
        (candidate) =>
          candidate.membershipRole !== "COMPANY_MANAGER" &&
          isMembershipAllowedInScope(candidate, options.accessScope),
      )
      .sort(
        (first, second) =>
          getScopedAccessPriority(first, options.accessScope) -
          getScopedAccessPriority(second, options.accessScope),
      )[0] ?? null
  );
}

export async function resolveStaffAccessCandidate(
  identifierValue: unknown,
  options: AuthenticateStaffOptions = {},
) {
  const identifier = normalizeIdentifier(identifierValue);

  if (!identifier) {
    return null;
  }

  const record = await resolveStaffAccessRecord(identifier, options);

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    username: record.username,
    role: record.membershipRole,
    organizationId: record.organizationId,
    organizationSlug: record.organizationSlug,
    organizationType: record.organizationType,
  } satisfies StaffAccessCandidate;
}

export async function authenticateStaff(
  identifierValue: unknown,
  passwordValue: unknown,
  options: AuthenticateStaffOptions = {},
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

  const record = await resolveStaffAccessRecord(identifier, options);

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
  } satisfies StaffPrincipal;
}
