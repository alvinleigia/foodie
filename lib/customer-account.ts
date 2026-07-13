import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers,
  locations,
  orderItems,
  orders,
  organizations,
} from "@/db/schema";
import type { customerProfileUpdateSchema } from "@/lib/validations/customer";
import type { z } from "zod";

export type CustomerProfileUpdate = z.infer<typeof customerProfileUpdateSchema>;

export async function getCustomerProfile(customerId: string) {
  const [customer] = await getDb()
    .select({
      dateOfBirth: customers.dateOfBirth,
      email: customers.email,
      emailVerifiedAt: customers.emailVerifiedAt,
      gender: customers.gender,
      id: customers.id,
      marketingOptIn: customers.marketingOptIn,
      name: customers.name,
      phone: customers.phone,
      phoneVerifiedAt: customers.phoneVerifiedAt,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  return customer ?? null;
}

export async function updateCustomerProfile(
  customerId: string,
  input: CustomerProfileUpdate,
) {
  const updates: Partial<typeof customers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.phone !== undefined) {
    updates.phone = input.phone;
    updates.phoneVerifiedAt = null;
  }

  if (input.dateOfBirth !== undefined) {
    updates.dateOfBirth = input.dateOfBirth;
  }

  if (input.gender !== undefined) {
    updates.gender = input.gender;
  }

  if (input.marketingOptIn !== undefined) {
    updates.marketingOptIn = input.marketingOptIn;
  }

  const [customer] = await getDb()
    .update(customers)
    .set(updates)
    .where(eq(customers.id, customerId))
    .returning();

  return customer ?? null;
}

export async function getCustomerOrderHistory(customerId: string) {
  const db = getDb();
  const customerOrders = await db
    .select({
      createdAt: orders.createdAt,
      currency: organizations.currency,
      locationName: locations.name,
      orderId: orders.id,
      orderNo: orders.orderNo,
      organizationName: organizations.name,
      status: orders.status,
    })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.organizationId))
    .innerJoin(locations, eq(locations.id, orders.locationId))
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  if (customerOrders.length === 0) {
    return [];
  }

  const items = await db
    .select({
      drinkName: orderItems.drinkName,
      id: orderItems.id,
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      status: orderItems.status,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, customerOrders.map((order) => order.orderId)));
  const itemsByOrderId = new Map<string, typeof items>();

  for (const item of items) {
    const orderItemsForOrder = itemsByOrderId.get(item.orderId) ?? [];
    orderItemsForOrder.push(item);
    itemsByOrderId.set(item.orderId, orderItemsForOrder);
  }

  return customerOrders.map((order) => ({
    ...order,
    createdAt: order.createdAt.toISOString(),
    items: itemsByOrderId.get(order.orderId) ?? [],
  }));
}
