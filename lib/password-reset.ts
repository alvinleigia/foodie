import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  organizations,
  passwordResetTokens,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/passwords";
import {
  canAccessRole,
  companyAdminRoles,
  platformAdminRoles,
  restaurantAdminRoles,
} from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";
import { resetPasswordSchema } from "@/lib/validations/tenant-admin";

const resetExpiryMs = 1000 * 60 * 60 * 24;

type PasswordResetViewer = {
  id?: string;
  username?: string;
  role: MembershipRole;
  organizationId?: string | null;
};

type PasswordResetTarget = {
  membershipId: string;
  userId: string;
  username: string;
  name: string;
  email: string;
  userStatus: "INVITED" | "ACTIVE" | "DISABLED";
  passwordHash: string | null;
  role: MembershipRole;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  parentOrganizationId: string | null;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
};

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createResetToken() {
  return randomBytes(32).toString("hex");
}

function canResetPasswordForTarget(
  viewer: PasswordResetViewer,
  target: PasswordResetTarget,
) {
  if (canAccessRole(viewer.role, platformAdminRoles)) {
    return true;
  }

  if (
    canAccessRole(viewer.role, companyAdminRoles) &&
    viewer.organizationId &&
    target.role !== "PLATFORM_ADMIN"
  ) {
    return (
      target.organizationId === viewer.organizationId ||
      target.parentOrganizationId === viewer.organizationId
    );
  }

  if (
    canAccessRole(viewer.role, restaurantAdminRoles) &&
    viewer.organizationId &&
    target.role !== "PLATFORM_ADMIN"
  ) {
    return target.organizationId === viewer.organizationId;
  }

  return false;
}

async function getPasswordResetTarget(membershipId: string) {
  const [target] = await getDb()
    .select({
      membershipId: memberships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      userStatus: users.status,
      passwordHash: users.passwordHash,
      role: memberships.role,
      isActive: memberships.isActive,
      organizationId: organizations.id,
      organizationName: organizations.name,
      parentOrganizationId: organizations.parentOrganizationId,
      organizationType: organizations.type,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  return target ?? null;
}

export async function getPasswordResetTargetForViewer(
  membershipId: string,
  viewer: PasswordResetViewer,
) {
  const target = await getPasswordResetTarget(membershipId);

  if (!target || !canResetPasswordForTarget(viewer, target)) {
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
  };
}

export async function createPasswordResetLink({
  membershipId,
  origin,
  viewer,
}: {
  membershipId: string;
  origin: string;
  viewer: PasswordResetViewer;
}) {
  const target = await getPasswordResetTarget(membershipId);

  if (!target || !canResetPasswordForTarget(viewer, target)) {
    throw new Error("User membership not found for this access scope.");
  }

  if (!target.isActive || target.userStatus !== "ACTIVE" || !target.passwordHash) {
    throw new Error(
      "Password reset links can only be created for active accepted users. Use invite links for pending users.",
    );
  }

  const token = createResetToken();
  const tokenHash = hashResetToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + resetExpiryMs);

  await getDb().transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, target.userId),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      );

    await tx.insert(passwordResetTokens).values({
      userId: target.userId,
      requestedByUserId: viewer.id || null,
      tokenHash,
      expiresAt,
      updatedAt: now,
    });
  });

  return {
    resetUrl: `${origin.replace(/\/$/, "")}/reset-password?token=${token}`,
    expiresAt: expiresAt.toISOString(),
    user: {
      name: target.name,
      email: target.email,
      username: target.username,
    },
  };
}

export async function getPasswordResetDetails(token: string) {
  const tokenHash = hashResetToken(token);
  const [resetToken] = await getDb()
    .select({
      email: users.email,
      expiresAt: passwordResetTokens.expiresAt,
      name: users.name,
      status: users.status,
      username: users.username,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!resetToken || resetToken.status !== "ACTIVE") {
    return null;
  }

  return {
    email: resetToken.email,
    name: resetToken.name,
    username: resetToken.username,
  };
}

export async function resetPasswordWithToken(input: unknown) {
  const parsed = resetPasswordSchema.parse(input);
  const tokenHash = hashResetToken(parsed.token);
  const db = getDb();
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!resetToken) {
    throw new Error("Password reset link is invalid or expired.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.password),
        updatedAt: new Date(),
      })
      .where(eq(users.id, resetToken.userId));

    await tx
      .update(passwordResetTokens)
      .set({
        usedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(passwordResetTokens.id, resetToken.id));
  });
}
