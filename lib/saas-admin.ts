import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import {
  memberships,
  orderingPoints,
  organizationSubscriptions,
  organizations,
  saasPlans,
  staffInvitations,
  tenantDomains,
  users,
} from "@/db/schema";
import {
  assertCompanyRestaurantCapacity,
  assertCompanyUserCapacity,
  getCommercialOwnerOrganizationId,
  getStarterPlanId,
  getTrialEndDate,
} from "@/lib/billing";
import { isPlatformManagedTenantDomain } from "@/lib/deployment-domain";
import { assertOrganizationFeatureEnabled } from "@/lib/feature-entitlements";
import { ensureUniqueOrganizationSlug } from "@/lib/organization-slugs";
import { hashPassword } from "@/lib/passwords";
import { slugify } from "@/lib/slugs";
import { buildCompanySubdomain } from "@/lib/tenant-domains";
import {
  createChildRestaurantSchema,
  createCompanyStaffUserSchema,
  createCompanyOrganizationSchema,
  companyDomainSchema,
  createRestaurantStaffUserSchema,
  reassignExistingUserSchema,
  updateChildRestaurantAdminSchema,
  updateCompanyStaffMembershipSchema,
  updateCompanyDomainSchema,
  updateOrganizationAdminSchema,
  updateStaffMembershipSchema,
} from "@/lib/validations/tenant-admin";
import { buildStaffPermissionOverrides } from "@/lib/staff-permissions";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";

type ReassignExistingUserOptions = {
  allowedOrganizationIds?: string[];
  allowedRoles?: MembershipRole[];
  deactivateOrganizationIds?: string[];
  userScopeOrganizationIds?: string[];
};

export async function listPlatformCompanies() {
  const rows = await getDb()
    .select({
      company: organizations,
      subscription: organizationSubscriptions,
      plan: saasPlans,
    })
    .from(organizations)
    .leftJoin(
      organizationSubscriptions,
      eq(organizationSubscriptions.organizationId, organizations.id),
    )
    .leftJoin(saasPlans, eq(saasPlans.id, organizationSubscriptions.planId))
    .where(eq(organizations.type, "COMPANY"));

  return rows.map((row) => ({
    ...row.company,
    subscription: row.subscription
      ? {
          id: row.subscription.id,
          status: row.subscription.status,
          trialEndsAt: row.subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEndsAt:
            row.subscription.currentPeriodEndsAt?.toISOString() ?? null,
          plan: row.plan
            ? {
                name: row.plan.name,
                slug: row.plan.slug,
                monthlyPrice: row.plan.monthlyPrice,
                maxRestaurants: row.plan.maxRestaurants,
                maxUsers: row.plan.maxUsers,
                maxMonthlyOrders: row.plan.maxMonthlyOrders,
                storageMb: row.plan.storageMb,
              }
            : null,
        }
      : null,
  }));
}

export async function getPlatformCompany(companyOrganizationId: string) {
  const [company] = await getDb()
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, companyOrganizationId),
        eq(organizations.type, "COMPANY"),
      ),
    )
    .limit(1);

  return company ?? null;
}

export async function getPlatformCompanyBySlugOrId(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identifier,
    );
  const [company] = await getDb()
    .select()
    .from(organizations)
    .where(
      and(
        isUuid
          ? eq(organizations.id, identifier)
          : eq(organizations.slug, normalizedIdentifier),
        eq(organizations.type, "COMPANY"),
      ),
    )
    .limit(1);

  return company ?? null;
}

export async function getPlatformCompanyWithSubscription(
  companyOrganizationId: string,
) {
  const companies = await listPlatformCompanies();

  return companies.find((company) => company.id === companyOrganizationId) ?? null;
}

export async function listCompanyDomains(companyOrganizationId: string) {
  const company = await getPlatformCompany(companyOrganizationId);

  if (!company) {
    return null;
  }

  const domains = await getDb()
    .select()
    .from(tenantDomains)
    .where(eq(tenantDomains.companyOrganizationId, companyOrganizationId));
  const restaurantIds = domains.flatMap((domain) =>
    domain.restaurantOrganizationId ? [domain.restaurantOrganizationId] : [],
  );
  const restaurantRows = restaurantIds.length
    ? await getDb()
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, restaurantIds))
    : [];
  const restaurantNames = new Map(
    restaurantRows.map((restaurant) => [restaurant.id, restaurant.name]),
  );

  return domains
    .filter(
      (
        domain,
      ): domain is typeof domain & { scope: "COMPANY" | "RESTAURANT" } =>
        domain.scope === "COMPANY" || domain.scope === "RESTAURANT",
    )
    .map((domain) => ({
      ...domain,
      isCustomDomain: !isPlatformManagedTenantDomain(domain.domain),
      restaurantName: domain.restaurantOrganizationId
        ? restaurantNames.get(domain.restaurantOrganizationId) ?? null
        : null,
    }));
}

async function assertDomainIsAvailable(domain: string, currentDomainId?: string) {
  const [existing] = await getDb()
    .select({
      id: tenantDomains.id,
      domain: tenantDomains.domain,
    })
    .from(tenantDomains)
    .where(eq(tenantDomains.domain, domain))
    .limit(1);

  if (existing && existing.id !== currentDomainId) {
    throw new Error("This domain is already linked to another tenant.");
  }
}

async function assertCustomDomainAccess(
  domain: string,
  companyOrganizationId: string,
  restaurantOrganizationId?: string | null,
) {
  if (isPlatformManagedTenantDomain(domain)) {
    return;
  }

  await assertOrganizationFeatureEnabled(
    restaurantOrganizationId ?? companyOrganizationId,
    "branding.custom_domains",
  );
}

export async function createCompanyDomain(companyOrganizationId: string, input: unknown) {
  const company = await getPlatformCompany(companyOrganizationId);

  if (!company) {
    return null;
  }

  const parsed = companyDomainSchema.parse(input);
  const db = getDb();

  if (parsed.isPrimary && !parsed.isActive) {
    throw new Error("A primary domain must be active.");
  }

  if (parsed.restaurantOrganizationId) {
    const [restaurant] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.id, parsed.restaurantOrganizationId),
          eq(organizations.parentOrganizationId, companyOrganizationId),
          eq(organizations.type, "RESTAURANT"),
        ),
      )
      .limit(1);

    if (!restaurant) {
      throw new Error("Restaurant not found for this company.");
    }
  }

  await assertCustomDomainAccess(
    parsed.domain,
    companyOrganizationId,
    parsed.restaurantOrganizationId,
  );

  await assertDomainIsAvailable(parsed.domain);

  return db.transaction(async (tx) => {
    if (parsed.isPrimary) {
      await tx
        .update(tenantDomains)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(
          parsed.restaurantOrganizationId
            ? and(
                eq(tenantDomains.scope, "RESTAURANT"),
                eq(
                  tenantDomains.restaurantOrganizationId,
                  parsed.restaurantOrganizationId,
                ),
              )
            : and(
                eq(tenantDomains.scope, "COMPANY"),
                eq(tenantDomains.companyOrganizationId, companyOrganizationId),
              ),
        );
    }

    const [domain] = await tx
      .insert(tenantDomains)
      .values({
        domain: parsed.domain,
        scope: parsed.restaurantOrganizationId ? "RESTAURANT" : "COMPANY",
        purpose: "ORDERING",
        companyOrganizationId,
        restaurantOrganizationId: parsed.restaurantOrganizationId,
        isPrimary: parsed.isPrimary,
        isActive: parsed.isActive,
        updatedAt: new Date(),
      })
      .returning();

    return domain;
  });
}

export async function updateCompanyDomain(
  companyOrganizationId: string,
  domainId: string,
  input: unknown,
) {
  const company = await getPlatformCompany(companyOrganizationId);

  if (!company) {
    return null;
  }

  const parsed = updateCompanyDomainSchema.parse(input);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.id, domainId),
        eq(tenantDomains.companyOrganizationId, companyOrganizationId),
      ),
    )
    .limit(1);

  if (!existing || !["COMPANY", "RESTAURANT"].includes(existing.scope)) {
    return null;
  }

  const nextIsActive = parsed.isActive ?? existing.isActive;
  const nextIsPrimary = parsed.isActive === false
    ? false
    : parsed.isPrimary ?? existing.isPrimary;

  if (nextIsPrimary && !nextIsActive) {
    throw new Error("A primary domain must be active.");
  }

  if (parsed.isActive === true || parsed.isPrimary === true) {
    await assertCustomDomainAccess(
      existing.domain,
      companyOrganizationId,
      existing.restaurantOrganizationId,
    );
  }

  return db.transaction(async (tx) => {
    if (nextIsPrimary) {
      await tx
        .update(tenantDomains)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(
          existing.scope === "RESTAURANT" && existing.restaurantOrganizationId
            ? and(
                eq(tenantDomains.scope, "RESTAURANT"),
                eq(
                  tenantDomains.restaurantOrganizationId,
                  existing.restaurantOrganizationId,
                ),
              )
            : and(
                eq(tenantDomains.scope, "COMPANY"),
                eq(tenantDomains.companyOrganizationId, companyOrganizationId),
              ),
        );
    }

    const [domain] = await tx
      .update(tenantDomains)
      .set({
        isPrimary: nextIsPrimary,
        isActive: nextIsActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantDomains.id, domainId),
          eq(tenantDomains.companyOrganizationId, companyOrganizationId),
        ),
      )
      .returning();

    return domain ?? null;
  });
}

export function isTenantAdminValidationError(error: unknown) {
  return error instanceof ZodError;
}

export async function createCompanyOrganization(input: unknown) {
  const parsed = createCompanyOrganizationSchema.parse(input);
  const db = getDb();
  const slug = await ensureUniqueOrganizationSlug(parsed.name);
  const starterPlanId = await getStarterPlanId();
  const trialEndsAt = getTrialEndDate();

  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(organizations)
      .values({
        type: "COMPANY",
        slug,
        name: parsed.name,
        timezone: parsed.timezone,
        currency: parsed.currency.toUpperCase(),
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    await tx.insert(organizationSubscriptions).values({
      organizationId: company.id,
      planId: starterPlanId,
      status: "TRIALING",
      trialEndsAt,
      currentPeriodEndsAt: trialEndsAt,
      updatedAt: new Date(),
    });

    await tx.insert(tenantDomains).values({
      domain: buildCompanySubdomain(company.slug),
      scope: "COMPANY",
      purpose: "ORDERING",
      companyOrganizationId: company.id,
      isPrimary: true,
      isActive: true,
      updatedAt: new Date(),
    });

    return company;
  });
}

export async function updateOrganizationAdmin(
  organizationId: string,
  input: unknown,
  expectedType?: "COMPANY" | "RESTAURANT",
  parentOrganizationId?: string,
) {
  const parsed = updateOrganizationAdminSchema.parse(input);
  const db = getDb();
  const conditions = [eq(organizations.id, organizationId)];

  if (expectedType) {
    conditions.push(eq(organizations.type, expectedType));
  }

  if (parentOrganizationId) {
    conditions.push(eq(organizations.parentOrganizationId, parentOrganizationId));
  }

  const [organization] = await db
    .update(organizations)
    .set({
      name: parsed.name,
      timezone: parsed.timezone,
      currency: parsed.currency.toUpperCase(),
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning();

  return organization ?? null;
}

export async function updateChildRestaurantAdmin(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
  input: unknown,
) {
  const parsed = updateChildRestaurantAdminSchema.parse(input);
  const db = getDb();
  const slug = await ensureUniqueOrganizationSlug(parsed.name, restaurantOrganizationId);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .update(organizations)
      .set({
        slug,
        name: parsed.name,
        timezone: parsed.timezone,
        currency: parsed.currency.toUpperCase(),
        customerCancellationFeeBps: Math.round(
          parsed.customerCancellationFeePercent * 100,
        ),
        isActive: parsed.isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizations.id, restaurantOrganizationId),
          eq(organizations.type, "RESTAURANT"),
          eq(organizations.parentOrganizationId, companyOrganizationId),
        ),
      )
      .returning();

    if (!organization) {
      return null;
    }

    await tx
      .update(orderingPoints)
      .set({
        name: parsed.name,
        isActive: parsed.isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orderingPoints.organizationId, restaurantOrganizationId),
          eq(orderingPoints.isDefault, true),
        ),
      );

    return organization;
  });
}

export async function listCompanyRestaurants(companyOrganizationId: string) {
  return getDb()
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );
}

export async function getCompanyRestaurant(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
) {
  const [restaurant] = await getDb()
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, restaurantOrganizationId),
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  return restaurant ?? null;
}

export async function getCompanyRestaurantBySlug(
  companyOrganizationId: string,
  restaurantSlug: string,
) {
  const [restaurant] = await getDb()
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.slug, restaurantSlug),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.parentOrganizationId, companyOrganizationId),
      ),
    )
    .limit(1);

  return restaurant ?? null;
}

export async function createChildRestaurant(
  companyOrganizationId: string,
  input: unknown,
) {
  const parsed = createChildRestaurantSchema.parse(input);
  const db = getDb();
  await assertCompanyRestaurantCapacity(companyOrganizationId);
  const organizationSlug = await ensureUniqueOrganizationSlug(parsed.name);

  return db.transaction(async (tx) => {
    const [restaurant] = await tx
      .insert(organizations)
      .values({
        parentOrganizationId: companyOrganizationId,
        type: "RESTAURANT",
        slug: organizationSlug,
        name: parsed.name,
        timezone: parsed.timezone,
        currency: parsed.currency.toUpperCase(),
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();
    const [defaultOrderingPoint] = await tx
      .insert(orderingPoints)
      .values({
        organizationId: restaurant.id,
        slug: slugify(parsed.name) || "restaurant",
        name: parsed.name,
        type: "GENERAL",
        isDefault: true,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { ...restaurant, defaultOrderingPoint };
  });
}

export async function createCompanyStaffUser(companyOrganizationId: string, input: unknown) {
  const parsed = createCompanyStaffUserSchema.parse(input);
  const db = getDb();
  const [company] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, companyOrganizationId),
        eq(organizations.type, "COMPANY"),
      ),
    )
    .limit(1);

  if (!company) {
    throw new Error("Company not found.");
  }

  await assertCompanyUserCapacity(companyOrganizationId);

  const passwordHash = await hashPassword(parsed.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        username: parsed.username,
        name: parsed.name,
        email: parsed.email.toLowerCase(),
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .returning();
    const [membership] = await tx
      .insert(memberships)
      .values({
        userId: user.id,
        organizationId: companyOrganizationId,
        role: parsed.role,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { user, membership };
  });
}

const companyMembershipRoles = ["COMPANY_OWNER"] as const;
const restaurantMembershipRoles = ["RESTAURANT_MANAGER", "ORDER_OPERATOR"] as const;

export async function listCompanyStaffMemberships(companyOrganizationId: string) {
  const rows = await getDb()
    .select({
      membership: memberships,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, companyOrganizationId),
        inArray(memberships.role, [...companyMembershipRoles]),
      ),
    );

  return rows.map((row) => ({
    membershipId: row.membership.id,
    userId: row.user.id,
    username: row.user.username,
    name: row.user.name,
    email: row.user.email,
    userStatus: row.user.status,
    role: row.membership.role,
    isActive: row.membership.isActive,
    createdAt: row.membership.createdAt.toISOString(),
    updatedAt: row.membership.updatedAt.toISOString(),
  }));
}

export async function getCompanyStaffMembership(
  companyOrganizationId: string,
  membershipId: string,
) {
  const companyUsers = await listCompanyStaffMemberships(companyOrganizationId);

  return companyUsers.find((user) => user.membershipId === membershipId) ?? null;
}

export async function updateCompanyStaffMembership(
  companyOrganizationId: string,
  membershipId: string,
  input: unknown,
) {
  const parsed = updateCompanyStaffMembershipSchema.parse(input);
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
        eq(memberships.organizationId, companyOrganizationId),
        inArray(memberships.role, [...companyMembershipRoles]),
      ),
    )
    .returning();

  if (!membership) {
    return null;
  }

  if (!parsed.isActive) {
    await db
      .update(staffInvitations)
      .set({
        expiresAt: new Date(0),
        updatedAt: new Date(),
      })
      .where(eq(staffInvitations.membershipId, membership.id));
  }

  return membership;
}

export async function listCompanyUserMemberships(companyOrganizationId: string) {
  const rows = await getDb()
    .select({
      membership: memberships,
      user: users,
      organization: organizations,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      or(
        and(
          eq(organizations.id, companyOrganizationId),
          eq(organizations.type, "COMPANY"),
          inArray(memberships.role, [...companyMembershipRoles]),
        ),
        and(
          eq(organizations.parentOrganizationId, companyOrganizationId),
          eq(organizations.type, "RESTAURANT"),
          inArray(memberships.role, [...restaurantMembershipRoles]),
        ),
      ),
    );

  return rows.map((row) => {
    const isCompanyAccess = row.organization.type === "COMPANY";

    return {
      membershipId: row.membership.id,
      userId: row.user.id,
      username: row.user.username,
      name: row.user.name,
      email: row.user.email,
      userStatus: row.user.status,
      role: row.membership.role,
      isActive: row.membership.isActive,
      organizationId: row.organization.id,
      organizationName: row.organization.name,
      organizationType: row.organization.type,
      accessScope: isCompanyAccess ? "COMPANY" : "RESTAURANT",
      accessLabel: isCompanyAccess
        ? "Company access"
        : row.organization.name,
      createdAt: row.membership.createdAt.toISOString(),
      updatedAt: row.membership.updatedAt.toISOString(),
    };
  });
}

export async function listRestaurantStaffMemberships(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
) {
  const restaurant = await getCompanyRestaurant(
    companyOrganizationId,
    restaurantOrganizationId,
  );

  if (!restaurant) {
    return null;
  }

  const companyUsers = await listCompanyUserMemberships(companyOrganizationId);

  return companyUsers.filter(
    (user) => user.organizationId === restaurantOrganizationId,
  );
}

export async function getCompanyUserMembership(
  companyOrganizationId: string,
  membershipId: string,
) {
  const companyUsers = await listCompanyUserMemberships(companyOrganizationId);

  return companyUsers.find((user) => user.membershipId === membershipId) ?? null;
}

export async function updateCompanyUserMembership(
  companyOrganizationId: string,
  membershipId: string,
  input: unknown,
) {
  const db = getDb();
  const [current] = await db
    .select({
      membership: memberships,
      organization: organizations,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!current) {
    return null;
  }

  const isCompanyMembership =
    current.organization.id === companyOrganizationId &&
    current.organization.type === "COMPANY" &&
    companyMembershipRoles.includes(
      current.membership.role as (typeof companyMembershipRoles)[number],
    );
  const isRestaurantMembership =
    current.organization.parentOrganizationId === companyOrganizationId &&
    current.organization.type === "RESTAURANT" &&
    restaurantMembershipRoles.includes(
      current.membership.role as (typeof restaurantMembershipRoles)[number],
    );

  if (!isCompanyMembership && !isRestaurantMembership) {
    return null;
  }

  const parsed = isCompanyMembership
    ? updateCompanyStaffMembershipSchema.parse(input)
    : updateStaffMembershipSchema.parse(input);

  if (
    isRestaurantMembership &&
    !restaurantMembershipRoles.includes(
      parsed.role as (typeof restaurantMembershipRoles)[number],
    )
  ) {
    throw new Error("Choose a restaurant staff role for this access.");
  }

  const permissionOverrides =
    isRestaurantMembership &&
    "permissions" in parsed &&
    parsed.permissions !== undefined
      ? buildStaffPermissionOverrides(parsed.role, parsed.permissions)
      : isRestaurantMembership && current.membership.role !== parsed.role
        ? {}
        : current.membership.permissionOverrides;

  const [membership] = await db
    .update(memberships)
    .set({
      role: parsed.role,
      isActive: parsed.isActive,
      permissionOverrides,
      updatedAt: new Date(),
    })
    .where(eq(memberships.id, membershipId))
    .returning();

  if (!membership) {
    return null;
  }

  if (!parsed.isActive) {
    await db
      .update(staffInvitations)
      .set({
        expiresAt: new Date(0),
        updatedAt: new Date(),
      })
      .where(eq(staffInvitations.membershipId, membership.id));
  }

  return membership;
}

export async function listPlatformReassignmentTargets() {
  const organizationRows = await getDb()
    .select({
      id: organizations.id,
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
      name: organizations.name,
      slug: organizations.slug,
      isActive: organizations.isActive,
    })
    .from(organizations)
    .where(or(eq(organizations.type, "COMPANY"), eq(organizations.type, "RESTAURANT")));

  const restaurantsByCompany = new Map<string, typeof organizationRows>();

  for (const organization of organizationRows) {
    if (organization.type !== "RESTAURANT" || !organization.parentOrganizationId) {
      continue;
    }

    const existing = restaurantsByCompany.get(organization.parentOrganizationId) ?? [];
    existing.push(organization);
    restaurantsByCompany.set(organization.parentOrganizationId, existing);
  }

  return organizationRows
    .filter((organization) => organization.type === "COMPANY")
    .map((company) => ({
      ...company,
      restaurants: restaurantsByCompany.get(company.id) ?? [],
    }));
}

async function getCompanyTreeOrganizationIds(companyOrganizationId: string) {
  const restaurantRows = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );

  return [companyOrganizationId, ...restaurantRows.map((restaurant) => restaurant.id)];
}

export async function listCompanyReassignmentTargets(companyOrganizationId: string) {
  const targets = await listPlatformReassignmentTargets();

  return targets.filter((company) => company.id === companyOrganizationId);
}

export async function listCompanyReassignableUsers(companyOrganizationId: string) {
  const organizationIds = await getCompanyTreeOrganizationIds(companyOrganizationId);
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(users.status, "ACTIVE"),
        isNotNull(users.passwordHash),
        inArray(memberships.organizationId, organizationIds),
      ),
    );
  const usersById = new Map(rows.map((user) => [user.id, user]));

  return Array.from(usersById.values()).sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

export async function listRestaurantReassignmentTargets(context: TenantContext) {
  const db = getDb();
  const [restaurant] = await db
    .select({
      id: organizations.id,
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
      name: organizations.name,
      slug: organizations.slug,
      isActive: organizations.isActive,
    })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  if (!restaurant) {
    return [];
  }

  const [company] = restaurant.parentOrganizationId
    ? await db
        .select({
          id: organizations.id,
          parentOrganizationId: organizations.parentOrganizationId,
          type: organizations.type,
          name: organizations.name,
          slug: organizations.slug,
          isActive: organizations.isActive,
        })
        .from(organizations)
        .where(eq(organizations.id, restaurant.parentOrganizationId))
        .limit(1)
    : [];

  return [
    {
      ...(company ?? {
        id: restaurant.id,
        parentOrganizationId: null,
        type: "COMPANY" as const,
        name: restaurant.name,
        slug: restaurant.slug,
        isActive: restaurant.isActive,
      }),
      restaurants: [
        restaurant,
      ],
    },
  ];
}

export async function listRestaurantReassignableUsers(context: TenantContext) {
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(users.status, "ACTIVE"),
        isNotNull(users.passwordHash),
        eq(memberships.organizationId, context.organizationId),
      ),
    );
  const usersById = new Map(rows.map((user) => [user.id, user]));

  return Array.from(usersById.values()).sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

export async function listPlatformReassignableUsers() {
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.status, "ACTIVE"), isNotNull(users.passwordHash)));

  return rows.sort((first, second) => first.name.localeCompare(second.name));
}

export async function reassignExistingUser(
  input: unknown,
  options: ReassignExistingUserOptions = {},
) {
  const parsed = reassignExistingUserSchema.parse(input);
  const identifier = parsed.identifier.toLowerCase();
  const isCompanyRole = parsed.role === "COMPANY_OWNER";
  const isRestaurantRole =
    parsed.role === "RESTAURANT_MANAGER" || parsed.role === "ORDER_OPERATOR";
  const db = getDb();

  const [targetOrganization] = await db
    .select({
      id: organizations.id,
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
      name: organizations.name,
      isActive: organizations.isActive,
    })
    .from(organizations)
    .where(eq(organizations.id, parsed.organizationId))
    .limit(1);

  if (!targetOrganization || !targetOrganization.isActive) {
    throw new Error("Target organization is not available.");
  }

  if (
    options.allowedOrganizationIds?.length &&
    !options.allowedOrganizationIds.includes(targetOrganization.id)
  ) {
    throw new Error("Target organization is outside your access scope.");
  }

  if (
    options.allowedRoles?.length &&
    !options.allowedRoles.includes(parsed.role)
  ) {
    throw new Error("Choose a role within your access scope.");
  }

  if (isCompanyRole && targetOrganization.type !== "COMPANY") {
    throw new Error("Company roles must be assigned to a company.");
  }

  if (isRestaurantRole && targetOrganization.type !== "RESTAURANT") {
    throw new Error("Operational roles must be assigned to a restaurant.");
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .limit(1);

  if (!user) {
    throw new Error("No existing user found for that email or username.");
  }

  if (user.status !== "ACTIVE" || !user.passwordHash) {
    throw new Error("Only accepted active users can be reassigned. Use an invite for new users.");
  }

  if (options.userScopeOrganizationIds?.length) {
    const [scopedMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          inArray(memberships.organizationId, options.userScopeOrganizationIds),
        ),
      )
      .limit(1);

    if (!scopedMembership) {
      throw new Error("User is outside your access scope. Use an invite for new users.");
    }
  }

  const companyOrganizationId = await getCommercialOwnerOrganizationId(
    targetOrganization.id,
  );

  if (companyOrganizationId) {
    await assertCompanyUserCapacity(companyOrganizationId, user.id);
  }

  return db.transaction(async (tx) => {
    const deactivateRestaurantOnly = parsed.deactivateExisting && isRestaurantRole;
    const deactivatedMemberships = parsed.deactivateExisting
      ? await tx
          .update(memberships)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(memberships.userId, user.id),
              eq(memberships.isActive, true),
              options.deactivateOrganizationIds?.length
                ? inArray(memberships.organizationId, options.deactivateOrganizationIds)
                : undefined,
              deactivateRestaurantOnly
                ? inArray(memberships.role, [...restaurantMembershipRoles])
                : undefined,
            ),
          )
          .returning()
      : [];

    const [existingMembership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.organizationId, parsed.organizationId),
        ),
      )
      .limit(1);

    const [membership] = existingMembership
      ? await tx
          .update(memberships)
          .set({
            role: parsed.role,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(memberships.id, existingMembership.id))
          .returning()
      : await tx
          .insert(memberships)
          .values({
            userId: user.id,
            organizationId: parsed.organizationId,
            role: parsed.role,
            isActive: true,
            updatedAt: new Date(),
          })
          .returning();

    return {
      user,
      membership,
      deactivatedMembershipCount: deactivatedMemberships.length,
      targetOrganization,
    };
  });
}

export async function reassignExistingUserForCompany(
  companyOrganizationId: string,
  input: unknown,
) {
  const organizationIds = await getCompanyTreeOrganizationIds(companyOrganizationId);

  return reassignExistingUser(input, {
    allowedOrganizationIds: organizationIds,
    allowedRoles: ["COMPANY_OWNER", "RESTAURANT_MANAGER", "ORDER_OPERATOR"],
    deactivateOrganizationIds: organizationIds,
    userScopeOrganizationIds: organizationIds,
  });
}

export async function reassignExistingUserForRestaurant(
  context: TenantContext,
  input: unknown,
) {
  return reassignExistingUser(input, {
    allowedOrganizationIds: [context.organizationId],
    allowedRoles: ["RESTAURANT_MANAGER", "ORDER_OPERATOR"],
    deactivateOrganizationIds: [context.organizationId],
    userScopeOrganizationIds: [context.organizationId],
  });
}

export async function listPlatformUserMemberships() {
  const rows = await getDb()
    .select({
      userId: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      userStatus: users.status,
      membershipId: memberships.id,
      membershipRole: memberships.role,
      membershipActive: memberships.isActive,
      membershipCreatedAt: memberships.createdAt,
      membershipUpdatedAt: memberships.updatedAt,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      organizationActive: organizations.isActive,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId));

  const usersById = new Map<
    string,
    {
      userId: string;
      username: string;
      name: string;
      email: string;
      userStatus: string;
      memberships: {
        membershipId: string;
        role: (typeof rows)[number]["membershipRole"];
        isActive: boolean;
        organizationId: string;
        organizationName: string;
        organizationType: (typeof rows)[number]["organizationType"];
        organizationActive: boolean;
        createdAt: string;
        updatedAt: string;
      }[];
    }
  >();

  for (const row of rows) {
    const user = usersById.get(row.userId) ?? {
      userId: row.userId,
      username: row.username,
      name: row.name,
      email: row.email,
      userStatus: row.userStatus,
      memberships: [],
    };

    user.memberships.push({
      membershipId: row.membershipId,
      role: row.membershipRole,
      isActive: row.membershipActive,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationType: row.organizationType,
      organizationActive: row.organizationActive,
      createdAt: row.membershipCreatedAt.toISOString(),
      updatedAt: row.membershipUpdatedAt.toISOString(),
    });

    usersById.set(row.userId, user);
  }

  return Array.from(usersById.values()).sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

export async function createRestaurantStaffUser(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
  input: unknown,
) {
  const parsed = createRestaurantStaffUserSchema.parse(input);
  const db = getDb();
  const [restaurant] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, restaurantOrganizationId),
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  await assertCompanyUserCapacity(companyOrganizationId);

  const passwordHash = await hashPassword(parsed.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
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
    const [membership] = await tx
      .insert(memberships)
      .values({
        userId: user.id,
        organizationId: restaurantOrganizationId,
        role: parsed.role,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { user, membership };
  });
}
