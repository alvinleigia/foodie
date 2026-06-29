import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, memberships, organizations } from "@/db/schema";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantDomainAccessScope } from "@/lib/tenant-domains";

export type LocationAccessOption = {
  membershipId: string;
  role: MembershipRole;
  organizationId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  locationLabel: string | null;
};

export type MembershipAccessOption = {
  membershipId: string;
  role: MembershipRole;
  organizationId: string;
  organizationName: string;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
  locationId: string | null;
  locationName: string | null;
  locationLabel: string | null;
};

type MembershipAccessRow = MembershipAccessOption & {
  parentOrganizationId: string | null;
};

function isMembershipAllowedInScope(
  option: MembershipAccessRow,
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

  if (scope.type === "RESTAURANT") {
    return option.organizationId === scope.restaurantOrganizationId;
  }

  return (
    option.organizationId === scope.restaurantOrganizationId &&
    option.locationId === scope.locationId
  );
}

function stripScopeMetadata(option: MembershipAccessRow): MembershipAccessOption {
  return {
    membershipId: option.membershipId,
    role: option.role,
    organizationId: option.organizationId,
    organizationName: option.organizationName,
    organizationType: option.organizationType,
    locationId: option.locationId,
    locationName: option.locationName,
    locationLabel: option.locationLabel,
  };
}

export async function getMembershipAccessOptions(
  userId: string,
  scope?: TenantDomainAccessScope,
) {
  const rows = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
      locationId: locations.id,
      locationName: locations.name,
      locationLabel: locations.label,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
        or(isNull(memberships.locationId), eq(locations.isActive, true)),
      ),
    );

  return rows.filter((row) => isMembershipAllowedInScope(row, scope)).map(stripScopeMetadata);
}

export async function resolveMembershipAccess(
  userId: string,
  membershipId: string,
  scope?: TenantDomainAccessScope,
) {
  const [option] = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
      locationId: locations.id,
      locationName: locations.name,
      locationLabel: locations.label,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.userId, userId),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
        or(isNull(memberships.locationId), eq(locations.isActive, true)),
      ),
    )
    .limit(1);

  if (!option || !isMembershipAllowedInScope(option, scope)) {
    return null;
  }

  return stripScopeMetadata(option);
}

export async function getLocationAccessOptions(userId: string) {
  const rows = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      locationId: locations.id,
      locationName: locations.name,
      locationLabel: locations.label,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .innerJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
        eq(locations.isActive, true),
        isNotNull(memberships.locationId),
      ),
    );

  return rows;
}

export async function resolveLocationAccess(
  userId: string,
  organizationId: string,
  locationId: string,
) {
  const [option] = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      locationId: locations.id,
      locationName: locations.name,
      locationLabel: locations.label,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .innerJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.locationId, locationId),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
        eq(locations.isActive, true),
      ),
    )
    .limit(1);

  return option ?? null;
}
