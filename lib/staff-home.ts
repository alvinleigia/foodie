import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getCompanyWorkspaceHref } from "@/lib/company-workspace";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { canAccessNavigation } from "@/lib/role-access";
import { getStaffNavigationItemsForRestaurant } from "@/lib/staff-navigation";
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

type StaffHomeOptions = {
  inventoryEnabled?: boolean;
  reportsEnabled?: boolean;
};

export function getStaffHomePathForOrganization(
  role: MembershipRole,
  organization?: StaffHomeOrganization | null,
  permissions?: StaffPermission[],
  options: StaffHomeOptions = {},
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

  return (
    getStaffNavigationItemsForRestaurant(organization.slug, options).find(
      (item) =>
        canAccessNavigation(
          role,
          item.access,
          item.permission,
          effectivePermissions,
        ),
    )?.href ?? null
  );
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

  const featureOptions =
    organization.type === "RESTAURANT"
      ? await Promise.all([
          getOrganizationFeatureEntitlement(
            organizationId,
            "operations.inventory",
          ),
          getOrganizationFeatureEntitlement(
            organizationId,
            "reports.operational",
          ),
        ]).then(([inventory, reports]) => ({
          inventoryEnabled: inventory.enabled,
          reportsEnabled: reports.enabled,
        }))
      : {};

  return getStaffHomePathForOrganization(
    role,
    organization,
    permissions,
    featureOptions,
  );
}
