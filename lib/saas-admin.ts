import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import {
  locations,
  memberships,
  organizationSubscriptions,
  organizations,
  saasPlans,
  staffInvitations,
  tenantDomains,
  users,
} from "@/db/schema";
import { getStarterPlanId, getTrialEndDate } from "@/lib/billing";
import { ensureUniqueOrganizationSlug } from "@/lib/organization-slugs";
import { hashPassword } from "@/lib/passwords";
import { slugify } from "@/lib/slugs";
import { buildCompanySubdomain } from "@/lib/tenant-domains";
import {
  createChildRestaurantSchema,
  createCompanyStaffUserSchema,
  createCompanyOrganizationSchema,
  companyDomainSchema,
  createRestaurantLocationSchema,
  createRestaurantStaffUserSchema,
  reassignExistingUserSchema,
  updateChildRestaurantAdminSchema,
  updateCompanyStaffMembershipSchema,
  updateCompanyDomainSchema,
  updateOrganizationAdminSchema,
  updateStaffMembershipSchema,
} from "@/lib/validations/tenant-admin";
import type { MembershipRole } from "@/lib/staff-auth";
import type { TenantContext } from "@/lib/tenant-context";

type ReassignExistingUserOptions = {
  allowedOrganizationIds?: string[];
  allowedLocationIds?: string[];
  allowedRoles?: MembershipRole[];
  deactivateOrganizationIds?: string[];
  userScopeOrganizationIds?: string[];
};

async function ensureUniqueLocationSlug(organizationId: string, baseName: string) {
  const db = getDb();
  const baseSlug = slugify(baseName) || "location";
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.organizationId, organizationId), eq(locations.slug, candidate)))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

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
                maxLocations: row.plan.maxLocations,
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

  return getDb()
    .select()
    .from(tenantDomains)
    .where(eq(tenantDomains.companyOrganizationId, companyOrganizationId));
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

export async function createCompanyDomain(companyOrganizationId: string, input: unknown) {
  const company = await getPlatformCompany(companyOrganizationId);

  if (!company) {
    return null;
  }

  const parsed = companyDomainSchema.parse(input);
  const db = getDb();

  await assertDomainIsAvailable(parsed.domain);

  return db.transaction(async (tx) => {
    if (parsed.isPrimary) {
      await tx
        .update(tenantDomains)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(eq(tenantDomains.companyOrganizationId, companyOrganizationId));
    }

    const [domain] = await tx
      .insert(tenantDomains)
      .values({
        domain: parsed.domain,
        scope: "COMPANY",
        purpose: parsed.purpose,
        companyOrganizationId,
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

  return db.transaction(async (tx) => {
    if (parsed.isPrimary) {
      await tx
        .update(tenantDomains)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(eq(tenantDomains.companyOrganizationId, companyOrganizationId));
    }

    const [domain] = await tx
      .update(tenantDomains)
      .set({
        ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
        ...(typeof parsed.isPrimary === "boolean" ? { isPrimary: parsed.isPrimary } : {}),
        ...(typeof parsed.isActive === "boolean" ? { isActive: parsed.isActive } : {}),
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
      purpose: "BOTH",
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

    if (parsed.location) {
      if (parsed.location.qrSlug) {
        const [existingQrLocation] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(
            and(
              eq(locations.qrSlug, parsed.location.qrSlug),
              ne(locations.organizationId, restaurantOrganizationId),
            ),
          )
          .limit(1);

        if (existingQrLocation) {
          throw new Error("QR slug is already used by another location.");
        }
      }

      await tx
        .update(locations)
        .set({
          name: parsed.location.name,
          label: parsed.location.label,
          qrSlug: parsed.location.qrSlug,
          timezone: parsed.location.timezone,
          isActive: parsed.location.isActive,
          updatedAt: new Date(),
        })
        .where(eq(locations.organizationId, restaurantOrganizationId));
    }

    return organization;
  });
}

export async function listCompanyRestaurants(companyOrganizationId: string) {
  const rows = await getDb()
    .select({
      organization: organizations,
      location: locations,
    })
    .from(organizations)
    .leftJoin(locations, eq(locations.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );

  const restaurantMap = new Map<
    string,
    typeof organizations.$inferSelect & {
      locations: (typeof locations.$inferSelect)[];
      locationsCount: number;
      primaryLocation: typeof locations.$inferSelect | null;
    }
  >();

  for (const row of rows) {
    const current = restaurantMap.get(row.organization.id);

    if (!current) {
      restaurantMap.set(row.organization.id, {
        ...row.organization,
        locations: row.location ? [row.location] : [],
        locationsCount: row.location ? 1 : 0,
        primaryLocation: row.location,
      });
      continue;
    }

    current.locationsCount += row.location ? 1 : 0;
    if (row.location) {
      current.locations.push(row.location);
    }
    current.primaryLocation ??= row.location;
  }

  return Array.from(restaurantMap.values());
}

export async function getCompanyRestaurant(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
) {
  const [row] = await getDb()
    .select({
      organization: organizations,
      location: locations,
    })
    .from(organizations)
    .leftJoin(locations, eq(locations.organizationId, organizations.id))
    .where(
      and(
        eq(organizations.id, restaurantOrganizationId),
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row.organization,
    primaryLocation: row.location,
    locations: await listRestaurantLocations(
      companyOrganizationId,
      restaurantOrganizationId,
    ),
  };
}

export async function listRestaurantLocations(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
) {
  const [restaurant] = await getDb()
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
    return null;
  }

  return getDb()
    .select()
    .from(locations)
    .where(eq(locations.organizationId, restaurantOrganizationId));
}

export async function createRestaurantLocation(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
  input: unknown,
) {
  const parsed = createRestaurantLocationSchema.parse(input);
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

  if (parsed.qrSlug) {
    const [existingQrLocation] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.qrSlug, parsed.qrSlug))
      .limit(1);

    if (existingQrLocation) {
      throw new Error("QR slug is already used by another location.");
    }
  }

  const slug = await ensureUniqueLocationSlug(restaurantOrganizationId, parsed.name);
  const [location] = await db
    .insert(locations)
    .values({
      organizationId: restaurantOrganizationId,
      slug,
      name: parsed.name,
      label: parsed.label,
      qrSlug: parsed.qrSlug,
      timezone: parsed.timezone,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .returning();

  return location;
}

export async function updateRestaurantLocation(
  companyOrganizationId: string,
  restaurantOrganizationId: string,
  locationId: string,
  input: unknown,
) {
  const parsed = createRestaurantLocationSchema.parse(input);
  const db = getDb();

  if (parsed.qrSlug) {
    const [existingQrLocation] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.qrSlug, parsed.qrSlug), ne(locations.id, locationId)))
      .limit(1);

    if (existingQrLocation) {
      throw new Error("QR slug is already used by another location.");
    }
  }

  const [location] = await db
    .update(locations)
    .set({
      name: parsed.name,
      label: parsed.label,
      qrSlug: parsed.qrSlug,
      timezone: parsed.timezone,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(locations.id, locationId),
        eq(locations.organizationId, restaurantOrganizationId),
      ),
    )
    .returning();

  if (!location) {
    return null;
  }

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

  return restaurant ? location : null;
}

export async function createChildRestaurant(
  companyOrganizationId: string,
  input: unknown,
) {
  const parsed = createChildRestaurantSchema.parse(input);
  const db = getDb();
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
    const locationSlug = await ensureUniqueLocationSlug(restaurant.id, parsed.locationName);
    const [location] = await tx
      .insert(locations)
      .values({
        organizationId: restaurant.id,
        slug: locationSlug,
        name: parsed.locationName,
        label: parsed.locationLabel,
        timezone: parsed.timezone,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { ...restaurant, primaryLocation: location };
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
        locationId: null,
        role: parsed.role,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { user, membership };
  });
}

const companyMembershipRoles = ["COMPANY_OWNER", "COMPANY_MANAGER"] as const;
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
        isNull(memberships.locationId),
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
        isNull(memberships.locationId),
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
      location: locations,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(
      or(
        and(
          eq(organizations.id, companyOrganizationId),
          eq(organizations.type, "COMPANY"),
          isNull(memberships.locationId),
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
    const locationLabel = row.location?.label
      ? `${row.location.name} - ${row.location.label}`
      : row.location?.name;

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
      locationId: row.location?.id ?? null,
      locationName: row.location?.name ?? null,
      locationLabel: row.location?.label ?? null,
      accessScope: isCompanyAccess ? "COMPANY" : "LOCATION",
      accessLabel: isCompanyAccess
        ? "Company access"
        : `${row.organization.name}${locationLabel ? ` - ${locationLabel}` : ""}`,
      createdAt: row.membership.createdAt.toISOString(),
      updatedAt: row.membership.updatedAt.toISOString(),
    };
  });
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
    !current.membership.locationId &&
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

  const [membership] = await db
    .update(memberships)
    .set({
      role: parsed.role,
      isActive: parsed.isActive,
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
  const db = getDb();
  const [organizationRows, locationRows] = await Promise.all([
    db
      .select({
        id: organizations.id,
        parentOrganizationId: organizations.parentOrganizationId,
        type: organizations.type,
        name: organizations.name,
        slug: organizations.slug,
        isActive: organizations.isActive,
      })
      .from(organizations)
      .where(or(eq(organizations.type, "COMPANY"), eq(organizations.type, "RESTAURANT"))),
    db
      .select({
        id: locations.id,
        organizationId: locations.organizationId,
        name: locations.name,
        label: locations.label,
        slug: locations.slug,
        isActive: locations.isActive,
      })
      .from(locations),
  ]);

  const locationsByRestaurant = new Map<string, typeof locationRows>();

  for (const location of locationRows) {
    const existing = locationsByRestaurant.get(location.organizationId) ?? [];
    existing.push(location);
    locationsByRestaurant.set(location.organizationId, existing);
  }

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
      restaurants: (restaurantsByCompany.get(company.id) ?? []).map((restaurant) => ({
        ...restaurant,
        locations: locationsByRestaurant.get(restaurant.id) ?? [],
      })),
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

  const [location] = await db
    .select({
      id: locations.id,
      organizationId: locations.organizationId,
      name: locations.name,
      label: locations.label,
      slug: locations.slug,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(eq(locations.id, context.locationId))
    .limit(1);

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
        {
          ...restaurant,
          locations: location ? [location] : [],
        },
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
  const isCompanyRole =
    parsed.role === "COMPANY_OWNER" || parsed.role === "COMPANY_MANAGER";
  const isLocationRole =
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

  if (isLocationRole && targetOrganization.type !== "RESTAURANT") {
    throw new Error("Operational roles must be assigned to a restaurant location.");
  }

  if (isCompanyRole && parsed.locationId) {
    throw new Error("Company owner/manager access cannot be assigned to a location.");
  }

  if (isLocationRole && !parsed.locationId) {
    throw new Error("Choose a location for restaurant manager or order operator access.");
  }

  if (parsed.locationId) {
    if (
      options.allowedLocationIds?.length &&
      !options.allowedLocationIds.includes(parsed.locationId)
    ) {
      throw new Error("Target location is outside your access scope.");
    }

    const [targetLocation] = await db
      .select({
        id: locations.id,
        organizationId: locations.organizationId,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.id, parsed.locationId))
      .limit(1);

    if (
      !targetLocation ||
      !targetLocation.isActive ||
      targetLocation.organizationId !== parsed.organizationId
    ) {
      throw new Error("Target location is not available for this restaurant.");
    }
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

  const locationCondition = parsed.locationId
    ? eq(memberships.locationId, parsed.locationId)
    : isNull(memberships.locationId);

  return db.transaction(async (tx) => {
    const deactivateLocationOnly = parsed.deactivateExisting && isLocationRole;
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
              deactivateLocationOnly ? isNotNull(memberships.locationId) : undefined,
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
          locationCondition,
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
            locationId: parsed.locationId,
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
    allowedRoles: [
      "COMPANY_OWNER",
      "COMPANY_MANAGER",
      "RESTAURANT_MANAGER",
      "ORDER_OPERATOR",
    ],
    deactivateOrganizationIds: organizationIds,
    userScopeOrganizationIds: organizationIds,
  });
}

export async function reassignExistingUserForRestaurant(
  context: TenantContext,
  input: unknown,
) {
  return reassignExistingUser(input, {
    allowedLocationIds: [context.locationId],
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
      locationId: locations.id,
      locationName: locations.name,
      locationLabel: locations.label,
      locationActive: locations.isActive,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(locations, eq(locations.id, memberships.locationId));

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
        locationId: string | null;
        locationName: string | null;
        locationLabel: string | null;
        locationActive: boolean | null;
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
      locationId: row.locationId,
      locationName: row.locationName,
      locationLabel: row.locationLabel,
      locationActive: row.locationActive,
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

  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, restaurantOrganizationId))
    .limit(1);

  if (!location) {
    throw new Error("Restaurant needs a location before staff can be assigned.");
  }

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
        locationId: location.id,
        role: parsed.role,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return { user, membership };
  });
}
