import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  appState,
  auditLogs,
  inventoryItems,
  memberships,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  orderingPoints,
  organizationSubscriptions,
  organizations,
  staffInvitations,
  tenantDomains,
  users,
} from "@/db/schema";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/tenant-defaults";

export function isUatDatabaseResetEnabled() {
  return process.env.ENABLE_UAT_DATABASE_RESET === "true";
}

export async function resetUatDatabase(platformOwnerUserId: string) {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.delete(staffInvitations);
    await tx.delete(auditLogs);
    await tx.delete(inventoryItems);
    await tx.delete(orderItems);
    await tx.delete(orders);
    await tx.delete(menuItems);
    await tx.delete(menuCategories);
    await tx.delete(tenantDomains).where(ne(tenantDomains.scope, "PLATFORM"));
    await tx.delete(organizationSubscriptions);
    await tx
      .delete(memberships)
      .where(
        ne(memberships.organizationId, PLATFORM_ORGANIZATION_ID),
      );
    await tx.delete(users).where(ne(users.id, platformOwnerUserId));
    await tx.delete(orderingPoints);
    await tx
      .delete(organizations)
      .where(ne(organizations.id, PLATFORM_ORGANIZATION_ID));
    await tx.delete(appState);

    await tx
      .update(users)
      .set({
        status: "ACTIVE",
        role: "ADMIN",
        updatedAt: new Date(),
      })
      .where(eq(users.id, platformOwnerUserId));

    await tx
      .update(organizations)
      .set({
        type: "PLATFORM",
        slug: "foodie-platform",
        name: "Foodie Platform",
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, PLATFORM_ORGANIZATION_ID));

    await tx
      .update(memberships)
      .set({
        role: "PLATFORM_ADMIN",
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberships.userId, platformOwnerUserId),
          eq(memberships.organizationId, PLATFORM_ORGANIZATION_ID),
        ),
      );
  });
}
