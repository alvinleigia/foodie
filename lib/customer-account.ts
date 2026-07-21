import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers,
  orderItems,
  orders,
  organizationCustomers,
  organizations,
} from "@/db/schema";
import type { customerProfileUpdateSchema } from "@/lib/validations/customer";
import { normalizeCustomerPhone } from "@/lib/validations/customer";
import type { z } from "zod";
import type { TenantContext } from "@/lib/tenant-context";

export type CustomerProfileUpdate = z.infer<typeof customerProfileUpdateSchema>;

export async function getCustomerProfile(
  customerId: string,
  context: TenantContext,
) {
  const db = getDb();
  const [identity] = await db
    .select({
      email: customers.email,
      name: customers.name,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!identity) {
    return null;
  }

  await db
    .insert(organizationCustomers)
    .values({
      customerId,
      name: identity.name,
      organizationId: context.organizationId,
    })
    .onConflictDoNothing({
      target: [
        organizationCustomers.organizationId,
        organizationCustomers.customerId,
      ],
    });

  const [customer] = await getDb()
    .select({
      customerId: organizationCustomers.customerId,
      dateOfBirth: organizationCustomers.dateOfBirth,
      email: customers.email,
      emailVerifiedAt: customers.emailVerifiedAt,
      gender: organizationCustomers.gender,
      id: organizationCustomers.id,
      marketingOptIn: organizationCustomers.marketingOptIn,
      name: organizationCustomers.name,
      organizationId: organizationCustomers.organizationId,
      phone: organizationCustomers.phone,
      phoneVerifiedAt: organizationCustomers.phoneVerifiedAt,
    })
    .from(organizationCustomers)
    .innerJoin(customers, eq(customers.id, organizationCustomers.customerId))
    .where(
      and(
        eq(organizationCustomers.customerId, customerId),
        eq(organizationCustomers.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return customer ?? null;
}

export async function updateCustomerProfile(
  customerId: string,
  context: TenantContext,
  input: CustomerProfileUpdate,
) {
  const existingCustomer = await getCustomerProfile(customerId, context);

  if (!existingCustomer) {
    return null;
  }

  const updates: Partial<typeof organizationCustomers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.phone !== undefined) {
    updates.phone = input.phone;

    const existingPhone = existingCustomer.phone
      ? normalizeCustomerPhone(existingCustomer.phone)
      : null;

    if (existingPhone !== input.phone) {
      updates.phoneVerifiedAt = null;
    }
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
    .update(organizationCustomers)
    .set(updates)
    .where(
      and(
        eq(organizationCustomers.id, existingCustomer.id),
        eq(organizationCustomers.organizationId, context.organizationId),
      ),
    )
    .returning();

  return customer ? getCustomerProfile(customerId, context) : null;
}

export async function markCustomerPhoneVerified(
  customerId: string,
  context: TenantContext,
  expectedPhone: string,
) {
  const verifiedAt = new Date();
  const [customer] = await getDb()
    .update(organizationCustomers)
    .set({ phoneVerifiedAt: verifiedAt, updatedAt: verifiedAt })
    .where(
      and(
        eq(organizationCustomers.customerId, customerId),
        eq(organizationCustomers.organizationId, context.organizationId),
        eq(organizationCustomers.phone, expectedPhone),
      ),
    )
    .returning({ phoneVerifiedAt: organizationCustomers.phoneVerifiedAt });

  return customer?.phoneVerifiedAt ?? null;
}

export async function getCustomerOrderHistory(
  customerId: string,
  context: TenantContext,
) {
  const db = getDb();
  const customer = await getCustomerProfile(customerId, context);

  if (!customer) {
    return [];
  }

  const customerOrders = await db
    .select({
      createdAt: orders.createdAt,
      currency: organizations.currency,
      fulfilmentType: orders.fulfilmentType,
      orderId: orders.id,
      orderNo: orders.orderNo,
      organizationName: organizations.name,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
    })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.organizationId))
    .where(
      and(
        eq(orders.organizationId, context.organizationId),
        eq(orders.organizationCustomerId, customer.id),
      ),
    )
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

export async function searchCustomersForStaff(
  query: string,
  context: TenantContext,
) {
  const searchTerm = `%${query.trim()}%`;

  return getDb()
    .selectDistinct({
      email: customers.email,
      id: organizationCustomers.id,
      name: organizationCustomers.name,
      phone: organizationCustomers.phone,
    })
    .from(organizationCustomers)
    .innerJoin(customers, eq(customers.id, organizationCustomers.customerId))
    .where(
      and(
        eq(organizationCustomers.organizationId, context.organizationId),
        or(
          ilike(organizationCustomers.name, searchTerm),
          ilike(customers.email, searchTerm),
          ilike(organizationCustomers.phone, searchTerm),
        ),
      ),
    )
    .orderBy(asc(organizationCustomers.name))
    .limit(10);
}

export async function getStaffVisibleCustomer(
  customerId: string,
  context: TenantContext,
) {
  const [customer] = await getDb()
    .select({
      customerId: organizationCustomers.customerId,
      email: customers.email,
      id: organizationCustomers.id,
      name: organizationCustomers.name,
      phone: organizationCustomers.phone,
    })
    .from(organizationCustomers)
    .innerJoin(customers, eq(customers.id, organizationCustomers.customerId))
    .where(
      and(
        eq(organizationCustomers.id, customerId),
        eq(organizationCustomers.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return customer ?? null;
}
