import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getCompanyWorkspaceHref } from "@/lib/company-workspace";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import type { MembershipRole } from "@/lib/staff-auth";

type StaffHomeOrganization = {
  slug: string;
  type: "PLATFORM" | "COMPANY" | "RESTAURANT";
};

type StaffHomeAccess = {
  organizationId?: string | null;
  role: MembershipRole;
};

export function getStaffHomePathForOrganization(
  role: MembershipRole,
  organization?: StaffHomeOrganization | null,
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

  if (role === "RESTAURANT_MANAGER") {
    return getRestaurantWorkspaceHref(organization.slug, "dashboard");
  }

  if (role === "ORDER_OPERATOR") {
    return getRestaurantWorkspaceHref(organization.slug, "orders");
  }

  return null;
}

export async function resolveStaffHomePath({
  organizationId,
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

  return getStaffHomePathForOrganization(role, organization);
}
