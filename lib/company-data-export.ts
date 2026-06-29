import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryItems,
  locations,
  memberships,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  organizationSubscriptions,
  organizations,
  saasPlans,
  staffInvitations,
  users,
} from "@/db/schema";

async function getRestaurantIds(companyOrganizationId: string) {
  const restaurants = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.parentOrganizationId, companyOrganizationId),
      ),
    );

  return restaurants.map((restaurant) => restaurant.id);
}

export async function getCompanyDataExport(companyOrganizationId: string) {
  const db = getDb();
  const [company] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, companyOrganizationId),
        eq(organizations.type, "COMPANY"),
      ),
    )
    .limit(1);

  if (!company) {
    return null;
  }

  const restaurantIds = await getRestaurantIds(companyOrganizationId);
  const scopedOrganizationIds = [companyOrganizationId, ...restaurantIds];

  const [
    subscriptionRows,
    restaurants,
    locationRows,
    membershipRows,
    categoryRows,
    itemRows,
    inventoryRows,
    orderRows,
  ] = await Promise.all([
    db
      .select({ subscription: organizationSubscriptions, plan: saasPlans })
      .from(organizationSubscriptions)
      .leftJoin(saasPlans, eq(saasPlans.id, organizationSubscriptions.planId))
      .where(eq(organizationSubscriptions.organizationId, companyOrganizationId)),
    restaurantIds.length
      ? db.select().from(organizations).where(inArray(organizations.id, restaurantIds))
      : Promise.resolve([]),
    restaurantIds.length
      ? db.select().from(locations).where(inArray(locations.organizationId, restaurantIds))
      : Promise.resolve([]),
    db
      .select({
        membership: memberships,
        user: {
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.organizationId, scopedOrganizationIds)),
    restaurantIds.length
      ? db
          .select()
          .from(menuCategories)
          .where(inArray(menuCategories.organizationId, restaurantIds))
      : Promise.resolve([]),
    restaurantIds.length
      ? db.select().from(menuItems).where(inArray(menuItems.organizationId, restaurantIds))
      : Promise.resolve([]),
    restaurantIds.length
      ? db
          .select()
          .from(inventoryItems)
          .where(inArray(inventoryItems.organizationId, restaurantIds))
      : Promise.resolve([]),
    restaurantIds.length
      ? db.select().from(orders).where(inArray(orders.organizationId, restaurantIds))
      : Promise.resolve([]),
  ]);

  const orderIds = orderRows.map((order) => order.id);
  const membershipIds = membershipRows.map((row) => row.membership.id);
  const [orderItemRows, invitationRows] = await Promise.all([
    orderIds.length
      ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : Promise.resolve([]),
    membershipIds.length
      ? db
          .select({
            id: staffInvitations.id,
            userId: staffInvitations.userId,
            membershipId: staffInvitations.membershipId,
            expiresAt: staffInvitations.expiresAt,
            acceptedAt: staffInvitations.acceptedAt,
            createdAt: staffInvitations.createdAt,
            updatedAt: staffInvitations.updatedAt,
          })
          .from(staffInvitations)
          .where(inArray(staffInvitations.membershipId, membershipIds))
      : Promise.resolve([]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    company,
    subscription: subscriptionRows[0] ?? null,
    restaurants,
    locations: locationRows,
    memberships: membershipRows,
    invitations: invitationRows,
    menuCategories: categoryRows,
    menuItems: itemRows,
    inventoryItems: inventoryRows,
    orders: orderRows,
    orderItems: orderItemRows,
  };
}
