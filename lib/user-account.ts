import { and, eq, ne, or } from "drizzle-orm";

import { getDb } from "@/db";
import { locations, memberships, organizations, users } from "@/db/schema";
import {
  canAccessRole,
  companyAdminRoles,
  platformAdminRoles,
  restaurantAdminRoles,
} from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";
import { updateUserAccountSchema } from "@/lib/validations/tenant-admin";

type AccountEditor = {
  id?: string;
  username?: string;
  role: MembershipRole;
  organizationId?: string | null;
  locationId?: string | null;
};

type UserAccountTarget = {
  membershipId: string;
  userId: string;
  username: string;
  name: string;
  email: string;
  userStatus: "INVITED" | "ACTIVE" | "DISABLED";
  role: MembershipRole;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  parentOrganizationId: string | null;
  locationId: string | null;
  locationName: string | null;
};

function canEditAccountForTarget(
  editor: AccountEditor,
  target: UserAccountTarget,
) {
  if (canAccessRole(editor.role, platformAdminRoles)) {
    return true;
  }

  if (
    canAccessRole(editor.role, companyAdminRoles) &&
    editor.organizationId &&
    target.role !== "PLATFORM_ADMIN"
  ) {
    return (
      target.organizationId === editor.organizationId ||
      target.parentOrganizationId === editor.organizationId
    );
  }

  if (
    canAccessRole(editor.role, restaurantAdminRoles) &&
    editor.organizationId &&
    editor.locationId &&
    target.role !== "PLATFORM_ADMIN"
  ) {
    return (
      target.organizationId === editor.organizationId &&
      target.locationId === editor.locationId
    );
  }

  return false;
}

async function getUserAccountTarget(membershipId: string) {
  const [target] = await getDb()
    .select({
      membershipId: memberships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      userStatus: users.status,
      role: memberships.role,
      isActive: memberships.isActive,
      organizationId: organizations.id,
      organizationName: organizations.name,
      parentOrganizationId: organizations.parentOrganizationId,
      locationId: locations.id,
      locationName: locations.name,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  return target ?? null;
}

export async function getUserAccountForEditor(
  membershipId: string,
  editor: AccountEditor,
) {
  const target = await getUserAccountTarget(membershipId);

  if (!target || !canEditAccountForTarget(editor, target)) {
    return null;
  }

  return {
    membershipId: target.membershipId,
    username: target.username,
    name: target.name,
    email: target.email,
    userStatus: target.userStatus,
    role: target.role,
    isActive: target.isActive,
    organizationName: target.organizationName,
    locationName: target.locationName,
  };
}

export async function updateUserAccountForEditor({
  editor,
  input,
  membershipId,
}: {
  editor: AccountEditor;
  input: unknown;
  membershipId: string;
}) {
  const target = await getUserAccountTarget(membershipId);

  if (!target || !canEditAccountForTarget(editor, target)) {
    throw new Error("User membership not found for this access scope.");
  }

  const parsed = updateUserAccountSchema.parse(input);
  const email = parsed.email.toLowerCase();

  const [duplicate] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        ne(users.id, target.userId),
        or(eq(users.username, parsed.username), eq(users.email, email)),
      ),
    )
    .limit(1);

  if (duplicate) {
    throw new Error("Username or email already belongs to another user.");
  }

  const previous = {
    username: target.username,
    name: target.name,
    email: target.email,
  };

  const [updatedUser] = await getDb()
    .update(users)
    .set({
      username: parsed.username,
      name: parsed.name,
      email,
      updatedAt: new Date(),
    })
    .where(eq(users.id, target.userId))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    });

  if (!updatedUser) {
    throw new Error("User account could not be updated.");
  }

  return {
    previous,
    target,
    user: updatedUser,
  };
}
