import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { memberships, organizations, users } from "@/db/schema";

type StaffSessionIdentity = {
  membershipId: string;
  sessionVersion: unknown;
  userId: string;
};

export function isCurrentStaffSessionVersion(
  candidateVersion: unknown,
  currentVersion: number,
) {
  return (
    typeof candidateVersion === "number" &&
    Number.isInteger(candidateVersion) &&
    candidateVersion === currentVersion
  );
}

export async function validateStaffSessionAccess({
  membershipId,
  sessionVersion,
  userId,
}: StaffSessionIdentity) {
  const [access] = await getDb()
    .select({
      membershipId: memberships.id,
      organizationId: memberships.organizationId,
      role: memberships.role,
      sessionVersion: users.sessionVersion,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.userId, userId),
        eq(memberships.isActive, true),
        eq(users.status, "ACTIVE"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (
    !access ||
    !isCurrentStaffSessionVersion(sessionVersion, access.sessionVersion)
  ) {
    return null;
  }

  return access;
}
