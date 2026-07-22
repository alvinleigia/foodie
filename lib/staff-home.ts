import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getCompanyWorkspaceHref } from "@/lib/company-workspace";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import type { MembershipRole } from "@/lib/staff-auth";
import {
  resolveStaffPermissions,
  type StaffPermission,
} from "@/lib/staff-permissions";

type StaffHomeOrganization = {
  slug: string;
  type: "PLATFORM" | "COMPANY" | "RESTAURANT";
};

type StaffHomeAccess = {
  organizationId?: string | null;
  permissions?: StaffPermission[];
  role: MembershipRole;
};

export function getStaffHomePathForOrganization(
  role: MembershipRole,
  organization?: StaffHomeOrganization | null,
  permissions?: StaffPermission[],
) {
  if (role === "PLATFORM_ADMIN") {
    return "/platform";
  }

  if (role === "COMPANY_OWNER" && organization?.type === "COMPANY") {
    return getCompanyWorkspaceHref(organization.slug, "dashboard");
  }

  if (organization?.type !== "RESTAURANT") {
    return null;
  }

  const effectivePermissions =
    permissions ?? resolveStaffPermissions(role, null);

  if (effectivePermissions.includes("restaurant.dashboard")) {
    return getRestaurantWorkspaceHref(organization.slug, "dashboard");
  }

  if (effectivePermissions.includes("orders.view")) {
    return getRestaurantWorkspaceHref(organization.slug, "orders");
  }

  if (effectivePermissions.includes("orders.create")) {
    return getRestaurantWorkspaceHref(organization.slug, "order");
  }

  if (effectivePermissions.includes("staff.manage")) {
    return getRestaurantWorkspaceHref(organization.slug, "staff");
  }

  if (effectivePermissions.includes("menu.manage")) {
    return getRestaurantWorkspaceHref(organization.slug, "menu");
  }

  return null;
}

export async function resolveStaffHomePath({
  organizationId,
  permissions,
  role,
}: StaffHomeAccess) {
  if (role === "PLATFORM_ADMIN") {
    return getStaffHomePathForOrganization(role);
  }

  if (!organizationId) {
    return null;
  }

  const [organization] = await getDb()
    .select({
      slug: organizations.slug,
      type: organizations.type,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  return getStaffHomePathForOrganization(role, organization, permissions);
}
