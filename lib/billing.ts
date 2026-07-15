import { and, count, countDistinct, eq, gte, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizationSubscriptions,
  organizations,
  orders,
  saasPlans,
  memberships,
  users,
} from "@/db/schema";

export class PlanLimitError extends Error {}

export function getTrialEndDate() {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  return trialEndsAt;
}

export async function getStarterPlanId() {
  const [plan] = await getDb()
    .select({ id: saasPlans.id })
    .from(saasPlans)
    .where(eq(saasPlans.slug, "starter"))
    .limit(1);

  if (!plan) {
    throw new Error("Starter plan is not configured. Run database migrations.");
  }

  return plan.id;
}

export async function getCommercialMetrics() {
  const db = getDb();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    activePlans,
    trialingCompanies,
    activeCompanies,
    suspendedCompanies,
    cancelledCompanies,
    monthlyOrders,
  ] = await Promise.all([
    db.select({ value: count() }).from(saasPlans).where(eq(saasPlans.isActive, true)),
    db
      .select({ value: count() })
      .from(organizationSubscriptions)
      .innerJoin(organizations, eq(organizations.id, organizationSubscriptions.organizationId))
      .where(eq(organizationSubscriptions.status, "TRIALING")),
    db
      .select({ value: count() })
      .from(organizationSubscriptions)
      .innerJoin(organizations, eq(organizations.id, organizationSubscriptions.organizationId))
      .where(eq(organizationSubscriptions.status, "ACTIVE")),
    db
      .select({ value: count() })
      .from(organizationSubscriptions)
      .innerJoin(organizations, eq(organizations.id, organizationSubscriptions.organizationId))
      .where(eq(organizationSubscriptions.status, "SUSPENDED")),
    db
      .select({ value: count() })
      .from(organizationSubscriptions)
      .innerJoin(organizations, eq(organizations.id, organizationSubscriptions.organizationId))
      .where(eq(organizationSubscriptions.status, "CANCELLED")),
    db
      .select({ value: count() })
      .from(orders)
      .where(gte(orders.createdAt, monthStart)),
  ]);

  return {
    activePlans: Number(activePlans[0]?.value ?? 0),
    trialingCompanies: Number(trialingCompanies[0]?.value ?? 0),
    activeCompanies: Number(activeCompanies[0]?.value ?? 0),
    suspendedCompanies: Number(suspendedCompanies[0]?.value ?? 0),
    cancelledCompanies: Number(cancelledCompanies[0]?.value ?? 0),
    monthlyOrders: Number(monthlyOrders[0]?.value ?? 0),
  };
}

export async function listCompanyCommercialStatus() {
  return getDb()
    .select({
      companyId: organizations.id,
      planName: saasPlans.name,
      planSlug: saasPlans.slug,
      status: organizationSubscriptions.status,
      trialEndsAt: organizationSubscriptions.trialEndsAt,
      currentPeriodEndsAt: organizationSubscriptions.currentPeriodEndsAt,
      maxRestaurants: saasPlans.maxRestaurants,
      maxUsers: saasPlans.maxUsers,
      maxMonthlyOrders: saasPlans.maxMonthlyOrders,
      storageMb: saasPlans.storageMb,
      monthlyPrice: saasPlans.monthlyPrice,
    })
    .from(organizationSubscriptions)
    .innerJoin(organizations, eq(organizations.id, organizationSubscriptions.organizationId))
    .innerJoin(saasPlans, eq(saasPlans.id, organizationSubscriptions.planId))
    .where(
      eq(organizations.type, "COMPANY"),
    );
}

async function getCompanyPlanLimits(companyOrganizationId: string) {
  const [limits] = await getDb()
    .select({
      maxRestaurants: saasPlans.maxRestaurants,
      maxUsers: saasPlans.maxUsers,
    })
    .from(organizationSubscriptions)
    .innerJoin(saasPlans, eq(saasPlans.id, organizationSubscriptions.planId))
    .where(eq(organizationSubscriptions.organizationId, companyOrganizationId))
    .limit(1);

  if (!limits) {
    throw new Error("Company subscription plan is not configured.");
  }

  return limits;
}

async function getCompanyOrganizationIds(companyOrganizationId: string) {
  const restaurants = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );

  return [companyOrganizationId, ...restaurants.map((restaurant) => restaurant.id)];
}

export async function assertCompanyRestaurantCapacity(
  companyOrganizationId: string,
) {
  const [limits, usage] = await Promise.all([
    getCompanyPlanLimits(companyOrganizationId),
    getDb()
      .select({ value: count() })
      .from(organizations)
      .where(
        and(
          eq(organizations.parentOrganizationId, companyOrganizationId),
          eq(organizations.type, "RESTAURANT"),
        ),
      ),
  ]);
  const restaurantCount = Number(usage[0]?.value ?? 0);

  if (restaurantCount >= limits.maxRestaurants) {
    throw new PlanLimitError(
      `This plan allows ${limits.maxRestaurants} restaurant${limits.maxRestaurants === 1 ? "" : "s"}. Upgrade the company plan before adding another restaurant.`,
    );
  }
}

export async function assertCompanyUserCapacity(
  companyOrganizationId: string,
  candidateUserId?: string,
) {
  const organizationIds = await getCompanyOrganizationIds(companyOrganizationId);

  if (candidateUserId) {
    const [existingAccess] = await getDb()
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, candidateUserId),
          eq(memberships.isActive, true),
          inArray(memberships.organizationId, organizationIds),
        ),
      )
      .limit(1);

    if (existingAccess) {
      return;
    }
  }

  const [limits, usage] = await Promise.all([
    getCompanyPlanLimits(companyOrganizationId),
    getDb()
      .select({ value: countDistinct(memberships.userId) })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          inArray(memberships.organizationId, organizationIds),
          or(eq(memberships.isActive, true), eq(users.status, "INVITED")),
        ),
      ),
  ]);
  const userCount = Number(usage[0]?.value ?? 0);

  if (userCount >= limits.maxUsers) {
    throw new PlanLimitError(
      `This plan allows ${limits.maxUsers} staff user${limits.maxUsers === 1 ? "" : "s"}. Upgrade the company plan before adding another user.`,
    );
  }
}

export async function updateCompanySubscriptionStatus(
  companyOrganizationId: string,
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED",
) {
  const [subscription] = await getDb()
    .update(organizationSubscriptions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.organizationId, companyOrganizationId))
    .returning();

  return subscription ?? null;
}

export async function getCommercialOwnerOrganizationId(organizationId: string) {
  const [organization] = await getDb()
    .select({
      id: organizations.id,
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    return null;
  }

  if (organization.type === "PLATFORM") {
    return null;
  }

  return organization.type === "COMPANY"
    ? organization.id
    : organization.parentOrganizationId;
}

export async function getTenantSubscriptionAccess(organizationId: string) {
  const commercialOwnerOrganizationId =
    await getCommercialOwnerOrganizationId(organizationId);

  if (!commercialOwnerOrganizationId) {
    return {
      allowed: true,
      status: null,
    };
  }

  const [subscription] = await getDb()
    .select({ status: organizationSubscriptions.status })
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, commercialOwnerOrganizationId))
    .limit(1);

  if (!subscription) {
    return {
      allowed: true,
      status: null,
    };
  }

  return {
    allowed: !["SUSPENDED", "CANCELLED"].includes(subscription.status),
    status: subscription.status,
  };
}

export async function assertTenantSubscriptionAccess(organizationId: string) {
  const access = await getTenantSubscriptionAccess(organizationId);

  if (!access.allowed) {
    throw new Error(
      `Tenant subscription is ${access.status?.toLowerCase()}. Please contact the platform owner.`,
    );
  }

  return access;
}
