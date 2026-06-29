import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  locations,
  memberships,
  organizations,
  staffInvitations,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/passwords";
import type { MembershipRole } from "@/lib/staff-auth";
import { TenantContext } from "@/lib/tenant-context";
import {
  acceptStaffInvitationSchema,
  createCompanyStaffInvitationSchema,
  createRestaurantStaffInvitationSchema,
  createStaffInvitationSchema,
} from "@/lib/validations/tenant-admin";

const inviteExpiryMs = 1000 * 60 * 60 * 24 * 7;

export class InvitationConflictError extends Error {}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return randomBytes(32).toString("hex");
}

function roleToUserRole(role: MembershipRole) {
  return role === "ORDER_OPERATOR" ? "STAFF" : "ADMIN";
}

async function createScopedStaffInvitation({
  input,
  origin,
  organizationId,
  locationId,
  allowedRoles,
}: {
  input: unknown;
  origin: string;
  organizationId: string;
  locationId: string | null;
  allowedRoles: readonly MembershipRole[];
}) {
  const parsed = createStaffInvitationSchema.parse(input);
  const normalizedEmail = parsed.email.toLowerCase();

  if (!allowedRoles.includes(parsed.role)) {
    throw new Error("Role is not allowed for this invitation.");
  }

  const db = getDb();
  const [existingUser] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(or(eq(users.email, normalizedEmail), eq(users.username, parsed.username)))
    .limit(1);

  if (existingUser?.status === "ACTIVE" && existingUser.passwordHash) {
    throw new InvitationConflictError(
      "This user already exists. Assign the existing user instead.",
    );
  }

  if (existingUser?.status === "INVITED" || existingUser?.passwordHash === null) {
    throw new InvitationConflictError(
      "A pending invite already exists for this email or username. Use the existing invite or assign the user after they accept it.",
    );
  }

  if (existingUser) {
    throw new InvitationConflictError(
      "This user account already exists but is not active.",
    );
  }

  const token = createInviteToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + inviteExpiryMs);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        username: parsed.username,
        name: parsed.name,
        email: normalizedEmail,
        passwordHash: null,
        role: roleToUserRole(parsed.role),
        status: "INVITED",
        updatedAt: new Date(),
      })
      .returning();
    const [membership] = await tx
      .insert(memberships)
      .values({
        userId: user.id,
        organizationId,
        locationId,
        role: parsed.role,
        isActive: false,
        updatedAt: new Date(),
      })
      .returning();
    const [invitation] = await tx
      .insert(staffInvitations)
      .values({
        userId: user.id,
        membershipId: membership.id,
        tokenHash,
        expiresAt,
        updatedAt: new Date(),
      })
      .returning();

    return { user, membership, invitation };
  });

  return {
    ...result,
    inviteUrl: `${origin.replace(/\/$/, "")}/invite?token=${token}`,
  };
}

export async function createRestaurantAdminStaffInvitation(
  context: TenantContext,
  input: unknown,
  origin: string,
) {
  return createScopedStaffInvitation({
    input,
    origin,
    organizationId: context.organizationId,
    locationId: context.locationId,
    allowedRoles: ["RESTAURANT_MANAGER", "ORDER_OPERATOR"],
  });
}

export async function createCompanyStaffInvitation(
  companyOrganizationId: string,
  input: unknown,
  origin: string,
) {
  const parsed = createCompanyStaffInvitationSchema.parse(input);
  const db = getDb();
  const [company] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, companyOrganizationId),
        eq(organizations.type, "COMPANY"),
      ),
    )
    .limit(1);

  if (!company) {
    throw new Error("Company not found.");
  }

  return createScopedStaffInvitation({
    input: parsed,
    origin,
    organizationId: company.id,
    locationId: null,
    allowedRoles: ["COMPANY_OWNER", "COMPANY_MANAGER"],
  });
}

export async function createChildRestaurantStaffInvitation(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
  locationId: string,
  input: unknown,
  origin: string,
) {
  const parsed = createRestaurantStaffInvitationSchema.parse(input);
  const db = getDb();
  const [restaurant] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, restaurantOrganizationId),
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, restaurant.id)))
    .limit(1);

  if (!location) {
    throw new Error("Restaurant needs a location before staff can be invited.");
  }

  return createScopedStaffInvitation({
    input: parsed,
    origin,
    organizationId: restaurant.id,
    locationId: location.id,
    allowedRoles: ["RESTAURANT_MANAGER", "ORDER_OPERATOR"],
  });
}

export async function acceptStaffInvitation(input: unknown) {
  const parsed = acceptStaffInvitationSchema.parse(input);
  const tokenHash = hashInvitationToken(parsed.token);
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(staffInvitations)
    .where(
      and(
        eq(staffInvitations.tokenHash, tokenHash),
        isNull(staffInvitations.acceptedAt),
        gt(staffInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invitation) {
    throw new Error("Invitation link is invalid or expired.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.password),
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(users.id, invitation.userId));
    await tx
      .update(memberships)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(memberships.id, invitation.membershipId));
    await tx
      .update(staffInvitations)
      .set({
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(staffInvitations.id, invitation.id));
  });
}
