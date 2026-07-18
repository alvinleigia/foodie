import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  memberships,
  orderingPoints,
  organizations,
  users,
} from "@/db/schema";
import {
  assertCompanyUserCapacity,
  getCommercialOwnerOrganizationId,
} from "@/lib/billing";
import { ensureUniqueOrganizationSlug } from "@/lib/organization-slugs";
import { hashPassword } from "@/lib/passwords";
import { TenantContext } from "@/lib/tenant-context";
import {
  createStaffUserSchema,
  orderingPointSettingsSchema,
  organizationSettingsSchema,
  updateStaffMembershipSchema,
} from "@/lib/validations/tenant-admin";

export async function getTenantAdminSnapshot(context: TenantContext) {
  const db = getDb();
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);
  const [orderingPoint] = await db
    .select({
      id: orderingPoints.id,
      name: orderingPoints.name,
      slug: orderingPoints.slug,
      qrSlug: orderingPoints.qrSlug,
      label: orderingPoints.label,
      isActive: orderingPoints.isActive,
    })
    .from(orderingPoints)
    .where(
      and(
        eq(orderingPoints.organizationId, context.organizationId),
        eq(orderingPoints.isDefault, true),
      ),
    )
    .limit(1);
  const staff = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      status: users.status,
      role: memberships.role,
      isActive: memberships.isActive,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, context.organizationId));

  return {
    organization,
    orderingPoint,
    staff: staff.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function updateOrganizationSettings(
  context: TenantContext,
  input: unknown,
) {
  const parsed = organizationSettingsSchema.parse(input);
  const db = getDb();
  const slug = await ensureUniqueOrganizationSlug(parsed.name, context.organizationId);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .update(organizations)
      .set({
        slug,
        name: parsed.name,
        logoUrl: parsed.logoUrl,
        timezone: parsed.timezone,
        currency: parsed.currency.toUpperCase(),
        customerCancellationFeeBps: Math.round(
          parsed.customerCancellationFeePercent * 100,
        ),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, context.organizationId))
      .returning();

    if (!organization) {
      return null;
    }

    await Promise.all([
      tx
        .update(orderingPoints)
        .set({ name: parsed.name, updatedAt: new Date() })
        .where(
          and(
            eq(orderingPoints.organizationId, context.organizationId),
            eq(orderingPoints.isDefault, true),
          ),
        ),
    ]);

    return organization;
  });
}

export async function updateOrderingPointSettings(context: TenantContext, input: unknown) {
  const parsed = orderingPointSettingsSchema.parse(input);
  const db = getDb();

  if (parsed.qrSlug) {
    const [existingQrOrderingPoint] = await db
      .select({ id: orderingPoints.id })
      .from(orderingPoints)
      .where(
        and(
          eq(orderingPoints.qrSlug, parsed.qrSlug),
          context.orderingPointId
            ? ne(orderingPoints.id, context.orderingPointId)
            : ne(orderingPoints.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (existingQrOrderingPoint) {
      throw new Error("QR slug is already used by another ordering point.");
    }
  }

  const [orderingPoint] = await db
    .update(orderingPoints)
    .set({
      name: parsed.name,
      label: parsed.label,
      qrSlug: parsed.qrSlug,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orderingPoints.organizationId, context.organizationId),
        eq(orderingPoints.isDefault, true),
      ),
    )
    .returning();

  return orderingPoint ?? null;
}

export async function checkOrderingPointQrSlugAvailability(
  context: TenantContext,
  qrSlug: string,
) {
  const parsedQrSlug = orderingPointSettingsSchema.shape.qrSlug.parse(qrSlug);

  if (!parsedQrSlug) {
    return {
      available: true,
      normalizedQrSlug: null,
    };
  }

  const db = getDb();
  const [existingQrOrderingPoint] = await db
    .select({ id: orderingPoints.id })
    .from(orderingPoints)
    .where(
      and(
        eq(orderingPoints.qrSlug, parsedQrSlug),
        context.orderingPointId
          ? ne(orderingPoints.id, context.orderingPointId)
          : ne(orderingPoints.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return {
    available: !existingQrOrderingPoint,
    normalizedQrSlug: parsedQrSlug,
  };
}

export async function createStaffUser(context: TenantContext, input: unknown) {
  const parsed = createStaffUserSchema.parse(input);
  const db = getDb();
  const companyOrganizationId = await getCommercialOwnerOrganizationId(
    context.organizationId,
  );

  if (!companyOrganizationId) {
    throw new Error("Restaurant company could not be resolved.");
  }

  await assertCompanyUserCapacity(companyOrganizationId);
  const passwordHash = await hashPassword(parsed.password);
  const [user] = await db
    .insert(users)
    .values({
      username: parsed.username,
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      passwordHash,
      role: parsed.role === "ORDER_OPERATOR" ? "STAFF" : "ADMIN",
      status: "ACTIVE",
      updatedAt: new Date(),
    })
    .returning();

  const [membership] = await db
    .insert(memberships)
    .values({
      userId: user.id,
      organizationId: context.organizationId,
      role: parsed.role,
      isActive: true,
      updatedAt: new Date(),
    })
    .returning();

  return { user, membership };
}

export async function updateStaffMembership(
  context: TenantContext,
  membershipId: string,
  input: unknown,
) {
  const parsed = updateStaffMembershipSchema.parse(input);
  const db = getDb();
  const [membership] = await db
    .update(memberships)
    .set({
      role: parsed.role,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, context.organizationId),
      ),
    )
    .returning();

  return membership ?? null;
}
