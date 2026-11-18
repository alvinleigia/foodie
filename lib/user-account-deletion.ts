import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, memberships, organizations, passwordResetTokens, users } from "@/db/schema";
import type { MembershipRole } from "@/lib/staff-auth";
import { accountRecordChecks, membershipActivityChecks } from "@/lib/staff-record-links";

export class AccountDeletionError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

type AccountDeletionEditor = {
  id: string;
  username?: string;
  role: MembershipRole;
  organizationId?: string | null;
};

export async function deleteUserAccount({
  membershipId, confirmationEmail, editor,
}: {
  membershipId: string;
  confirmationEmail: string;
  editor: AccountDeletionEditor;
}) {
  if (editor.role !== "PLATFORM_ADMIN" && editor.role !== "COMPANY_OWNER") {
    throw new AccountDeletionError("Only company owners and platform administrators can delete accounts.", 403);
  }
  if (editor.role === "COMPANY_OWNER" && !editor.organizationId) {
    throw new AccountDeletionError("Select your company access before deleting accounts.", 403);
  }
  return getDb().transaction(async (tx) => {
    const [target] = await tx.select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(
        eq(memberships.id, membershipId),
        editor.role === "PLATFORM_ADMIN" ? undefined : or(
          eq(organizations.id, editor.organizationId!),
          eq(organizations.parentOrganizationId, editor.organizationId!),
        ),
      ));
    if (!target) return null;
    if (target.userId === editor.id) throw new AccountDeletionError("You cannot delete your own account.", 400);

    const initialMemberships = await tx.select({ organizationId: memberships.organizationId })
      .from(memberships).where(eq(memberships.userId, target.userId));
    const organizationIds = initialMemberships.map((membership) => membership.organizationId);
    // Match staff-removal lock order and serialize last-owner/manager checks across accounts.
    await tx.select({ id: organizations.id }).from(organizations)
      .where(inArray(organizations.id, organizationIds)).orderBy(asc(organizations.id)).for("update");
    await tx.select({ id: memberships.id }).from(memberships)
      .where(inArray(memberships.organizationId, organizationIds)).orderBy(asc(memberships.id)).for("update");
    const [user] = await tx.select({ id: users.id, email: users.email, username: users.username, status: users.status })
      .from(users).where(eq(users.id, target.userId)).for("update");
    if (!user) return null;

    const access = await tx.select({ membership: memberships, organization: organizations })
      .from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, user.id));
    if (!access.some(({ membership }) => membership.id === membershipId)) return null;
    if (access.some(({ organization }) => !organizationIds.includes(organization.id))) {
      throw new AccountDeletionError("This user's access changed. Refresh the page and try again.");
    }
    if (confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new AccountDeletionError("Enter the account's current email address to confirm deletion.", 400);
    }
    if (access.some(({ membership, organization }) => membership.role === "PLATFORM_ADMIN" || organization.type === "PLATFORM")) {
      throw new AccountDeletionError("Platform administrator accounts cannot be deleted here.");
    }
    if (editor.role === "COMPANY_OWNER" && access.some(({ organization }) =>
      organization.id !== editor.organizationId && organization.parentOrganizationId !== editor.organizationId,
    )) {
      throw new AccountDeletionError("This account has access outside your company. Contact the platform administrator or remove only its company access.");
    }

    for (const { membership } of access) {
      if (user.status !== "ACTIVE" || !membership.isActive ||
        (membership.role !== "COMPANY_OWNER" && membership.role !== "RESTAURANT_MANAGER")) continue;
      const [replacement] = await tx.select({ id: memberships.id }).from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(
          eq(memberships.organizationId, membership.organizationId),
          eq(memberships.role, membership.role), eq(memberships.isActive, true),
          ne(memberships.userId, user.id), eq(users.status, "ACTIVE"),
        )).limit(1);
      if (!replacement) {
        throw new AccountDeletionError(membership.role === "COMPANY_OWNER"
          ? "The last active company owner cannot be deleted. Assign another owner first."
          : "The last active restaurant manager cannot be deleted. Assign another manager first.");
      }
    }

    const membershipIds = access.map(({ membership }) => membership.id);
    const [activity] = await tx.execute<{ linked: boolean }>(sql`
      select ${or(...membershipActivityChecks(membershipIds))} as linked
    `);
    if (activity.linked) throw new AccountDeletionError("This account has linked records. Disable its access instead of deleting it.");

    // Setup and credentials may be removed; all remaining references must be absent.
    // Any failed check rolls this entire transaction back, including these cascades.
    await tx.delete(memberships).where(eq(memberships.userId, user.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    const [records] = await tx.execute<{ linked: boolean }>(sql`
      select ${or(...accountRecordChecks(user.id))} as linked
    `);
    if (records.linked) throw new AccountDeletionError("This account has linked records. Disable its access instead of deleting it.");

    await tx.insert(auditLogs).values({
      actorUserId: editor.id, actorUsername: editor.username ?? null, actorRole: editor.role,
      organizationId: access.find(({ membership }) => membership.id === membershipId)!.organization.id,
      action: "user.account.delete", entityType: "user", entityId: user.id,
      metadata: { username: user.username, membershipIds, accountDeleted: true },
    });
    await tx.delete(users).where(eq(users.id, user.id));
    return { deletedUserId: user.id, deletedMembershipIds: membershipIds };
  });
}
