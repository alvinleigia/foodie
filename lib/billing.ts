import { count, eq, gte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  organizationSubscriptions,
  organizations,
  orders,
  saasPlans,
} from "@/db/schema";

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
      maxLocations: saasPlans.maxLocations,
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
