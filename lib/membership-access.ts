import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { memberships, organizations } from "@/db/schema";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantDomainAccessScope } from "@/lib/tenant-domains";

export type MembershipAccessOption = {
  membershipId: string;
  role: MembershipRole;
  organizationId: string;
  organizationName: string;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
};

export type ScopedMembershipAccess = Pick<
  MembershipAccessOption,
  "organizationId" | "organizationType"
> & {
  parentOrganizationId: string | null;
};

type MembershipAccessRow = MembershipAccessOption & ScopedMembershipAccess;

export function isMembershipAllowedInScope(
  option: ScopedMembershipAccess,
  scope?: TenantDomainAccessScope,
) {
  if (!scope || scope.type === "PLATFORM") {
    return true;
  }

  if (option.organizationType === "COMPANY") {
    return option.organizationId === scope.companyOrganizationId;
  }

  if (scope.type === "COMPANY") {
    return option.parentOrganizationId === scope.companyOrganizationId;
  }

  return option.organizationId === scope.restaurantOrganizationId;
}

function stripScopeMetadata(option: MembershipAccessRow): MembershipAccessOption {
  return {
    membershipId: option.membershipId,
    role: option.role,
    organizationId: option.organizationId,
    organizationName: option.organizationName,
    organizationType: option.organizationType,
  };
}

function getMembershipAccessQuery() {
  return getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId));
}

export async function getMembershipAccessOptions(
  userId: string,
  scope?: TenantDomainAccessScope,
) {
  const rows = await getMembershipAccessQuery().where(
    and(
      eq(memberships.userId, userId),
      eq(memberships.isActive, true),
      eq(organizations.isActive, true),
    ),
  );

  return rows.filter((row) => isMembershipAllowedInScope(row, scope)).map(stripScopeMetadata);
}

export async function resolveMembershipAccess(
  userId: string,
  membershipId: string,
  scope?: TenantDomainAccessScope,
) {
  const [option] = await getMembershipAccessQuery()
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.userId, userId),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!option || !isMembershipAllowedInScope(option, scope)) {
    return null;
  }

  return stripScopeMetadata(option);
}
