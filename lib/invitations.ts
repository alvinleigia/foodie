import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  staffInvitations,
  users,
} from "@/db/schema";
import {
  assertCompanyUserCapacity,
  getCommercialOwnerOrganizationId,
} from "@/lib/billing";
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

async function findOpenInvitationForMembership(membershipId: string) {
  const [invitation] = await getDb()
    .select({ id: staffInvitations.id })
    .from(staffInvitations)
    .where(
      and(
        eq(staffInvitations.membershipId, membershipId),
        isNull(staffInvitations.acceptedAt),
        gt(staffInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return invitation;
}

async function createScopedStaffInvitation({
  input,
  origin,
  organizationId,
  allowedRoles,
}: {
  input: unknown;
  origin: string;
  organizationId: string;
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
      email: users.email,
      id: users.id,
      name: users.name,
      passwordHash: users.passwordHash,
      status: users.status,
      username: users.username,
    })
    .from(users)
    .where(or(eq(users.email, normalizedEmail), eq(users.username, parsed.username)))
    .limit(1);

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
    const [user] = existingUser
      ? [existingUser]
      : await tx
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

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (existingMembership?.isActive) {
      throw new InvitationConflictError("This user already has active access here.");
    }

    if (existingMembership) {
      const openInvitation = await findOpenInvitationForMembership(existingMembership.id);

      if (openInvitation) {
        throw new InvitationConflictError(
          "A pending invite already exists for this user's access here.",
        );
      }
    }

    const [membership] = existingMembership
      ? await tx
          .update(memberships)
          .set({
            role: parsed.role,
            updatedAt: new Date(),
          })
          .where(eq(memberships.id, existingMembership.id))
          .returning()
      : await tx
          .insert(memberships)
          .values({
            userId: user.id,
            organizationId,
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
  const companyOrganizationId = await getCommercialOwnerOrganizationId(
    context.organizationId,
  );

  if (!companyOrganizationId) {
    throw new Error("Restaurant company could not be resolved.");
  }

  await assertCompanyUserCapacity(companyOrganizationId);

  return createScopedStaffInvitation({
    input,
    origin,
    organizationId: context.organizationId,
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

  await assertCompanyUserCapacity(company.id);

  return createScopedStaffInvitation({
    input: parsed,
    origin,
    organizationId: company.id,
    allowedRoles: ["COMPANY_OWNER"],
  });
}

export async function createChildRestaurantStaffInvitation(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
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

  await assertCompanyUserCapacity(companyOrganizationId);

  return createScopedStaffInvitation({
    input: parsed,
    origin,
    organizationId: restaurant.id,
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

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, invitation.userId))
    .limit(1);

  if (!user) {
    throw new Error("Invitation user no longer exists.");
  }

  const requiresPassword = user.status !== "ACTIVE" || !user.passwordHash;

  if (requiresPassword && (!parsed.password || parsed.password.length < 8)) {
    throw new Error("Password must be at least 8 characters.");
  }

  await db.transaction(async (tx) => {
    if (requiresPassword) {
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(parsed.password ?? ""),
          status: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(users.id, invitation.userId));
    }

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

export async function getStaffInvitationDetails(token: string) {
  const tokenHash = hashInvitationToken(token);
  const [invitation] = await getDb()
    .select({
      email: users.email,
      expiresAt: staffInvitations.expiresAt,
      name: users.name,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(staffInvitations)
    .innerJoin(users, eq(users.id, staffInvitations.userId))
    .where(
      and(
        eq(staffInvitations.tokenHash, tokenHash),
        isNull(staffInvitations.acceptedAt),
        gt(staffInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invitation) {
    return null;
  }

  return {
    email: invitation.email,
    name: invitation.name,
    requiresPassword: invitation.status !== "ACTIVE" || !invitation.passwordHash,
  };
}
