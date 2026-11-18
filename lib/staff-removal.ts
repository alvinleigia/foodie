import { and, asc, eq, is, ne, or, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { auditLogs, memberships, organizations, users } from "@/db/schema";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";
import { accountRecordChecks } from "@/lib/staff-record-links";

export class StaffRemovalError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "StaffRemovalError";
  }
}

type RemovalActor = {
  id: string;
  membershipId: string;
  username?: string;
  role: MembershipRole;
};

function linkedRecordChecks(
  organizationId: string,
  membershipId: string,
  userId: string,
) {
  return Object.values(schema).flatMap((table) => {
    // Account credentials stay intact; invitations and job assignments are membership setup.
    if (
      !is(table, PgTable) ||
      table === memberships ||
      table === schema.staffInvitations ||
      table === schema.staffJobAssignments ||
      table === schema.passwordResetTokens
    ) {
      return [];
    }

    const config = getTableConfig(table);
    const membershipLinks = [];
    const userLinks = [];
    for (const key of config.foreignKeys) {
      const reference = key.reference();
      for (const [index, column] of reference.foreignColumns.entries()) {
        if (column === memberships.id) {
          membershipLinks.push(eq(reference.columns[index], membershipId));
        }
        if (column === users.id) {
          userLinks.push(eq(reference.columns[index], userId));
        }
      }
    }
    if (!membershipLinks.length && !userLinks.length) return [];

    const scope = config.columns
      .filter((column) =>
        ["organization_id", "source_organization_id", "destination_organization_id"].includes(column.name),
      )
      .map((column) => eq(column, organizationId));
    const linked = or(
      ...membershipLinks,
      userLinks.length ? and(or(...userLinks), or(...scope)) : undefined,
    );
    return [sql`exists (select 1 from ${table} where ${linked})`];
  });
}

export async function removeStaffMembership(
  context: TenantContext,
  membershipId: string,
  actor: RemovalActor,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [restaurant] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(
        eq(organizations.id, context.organizationId),
        eq(organizations.type, "RESTAURANT"),
      ))
      .for("update");
    if (!restaurant) return null;

    // Lock the restaurant's memberships before checking the last-manager safeguard.
    const staff = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, context.organizationId))
      .orderBy(asc(memberships.id))
      .for("update");
    const target = staff.find((membership) => membership.id === membershipId);
    if (!target) return null;
    if (target.id === actor.membershipId || target.userId === actor.id) {
      throw new StaffRemovalError("You cannot remove your own restaurant access.", 400);
    }
    if (target.role !== "RESTAURANT_MANAGER" && target.role !== "ORDER_OPERATOR") {
      throw new StaffRemovalError("Only restaurant staff can be removed here.", 400);
    }

    const [user] = await tx
      .select({ id: users.id, status: users.status, passwordHash: users.passwordHash, username: users.username })
      .from(users)
      .where(eq(users.id, target.userId))
      .for("update");
    if (!user) return null;
    if (target.role === "RESTAURANT_MANAGER" && target.isActive && user.status === "ACTIVE") {
      const [otherManager] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(
          eq(memberships.organizationId, context.organizationId),
          ne(memberships.id, target.id),
          eq(memberships.role, "RESTAURANT_MANAGER"),
          eq(memberships.isActive, true),
          eq(users.status, "ACTIVE"),
        ))
        .limit(1);
      if (!otherManager) {
        throw new StaffRemovalError("The last active restaurant manager cannot be removed.");
      }
    }

    // Inspect all schema foreign keys, including SET NULL and CASCADE links, before deleting.
    const [records] = await tx.execute<{ linked: boolean }>(sql`
      select ${or(...linkedRecordChecks(context.organizationId, target.id, target.userId))} as linked
    `);
    if (records.linked) {
      throw new StaffRemovalError("This staff member has linked records. Deactivate their access instead of removing them.");
    }

    const invitations = await tx.select({ acceptedAt: schema.staffInvitations.acceptedAt })
      .from(schema.staffInvitations)
      .where(eq(schema.staffInvitations.membershipId, target.id));
    const invitationOnly = user.status === "INVITED" && user.passwordHash === null &&
      invitations.length > 0 && invitations.every((invitation) => invitation.acceptedAt === null);

    await tx.delete(memberships).where(and(
      eq(memberships.id, target.id),
      eq(memberships.organizationId, context.organizationId),
    ));

    let accountDeleted = false;
    if (invitationOnly) {
      // After membership setup has cascaded, check every remaining user reference globally.
      const [accountRecords] = await tx.execute<{ linked: boolean }>(sql`
        select ${or(...accountRecordChecks(user.id))} as linked
      `);
      if (!accountRecords.linked) {
        await tx.delete(users).where(eq(users.id, user.id));
        accountDeleted = true;
      }
    }

    await tx.insert(auditLogs).values({
      actorUserId: actor.id,
      actorUsername: actor.username ?? null,
      actorRole: actor.role,
      organizationId: context.organizationId,
      action: "restaurant.staff.remove",
      entityType: "membership",
      entityId: target.id,
      metadata: { userId: target.userId, username: user.username, role: target.role, accountDeleted },
    });
    return target;
  });
}
