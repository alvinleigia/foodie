import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, memberships, organizations } from "@/db/schema";
import type { MembershipRole } from "@/lib/staff-auth";

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

export async function getMembershipAccessOptions(userId: string) {
  const rows = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
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

  return rows satisfies MembershipAccessOption[];
}

export async function resolveMembershipAccess(userId: string, membershipId: string) {
  const [option] = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
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

  return option ?? null;
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
