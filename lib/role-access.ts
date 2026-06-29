import type { MembershipRole } from "@/lib/staff-auth";

export const platformAdminRoles = ["PLATFORM_ADMIN"] satisfies MembershipRole[];

export const companyAdminRoles = [
  "COMPANY_OWNER",
  "COMPANY_MANAGER",
] satisfies MembershipRole[];

export const restaurantAdminRoles = [
  "RESTAURANT_MANAGER",
] satisfies MembershipRole[];

export const operationalRoles = [
  ...restaurantAdminRoles,
  "ORDER_OPERATOR",
] satisfies MembershipRole[];

export function canAccessRole(
  role: MembershipRole | null | undefined,
  allowedRoles: MembershipRole[],
) {
  return Boolean(role && allowedRoles.includes(role));
}

export function getHomePathForRole(role: MembershipRole) {
  if (canAccessRole(role, platformAdminRoles)) {
    return "/platform";
  }

  if (role === "COMPANY_OWNER" || role === "COMPANY_MANAGER") {
    return "/company";
  }

  if (role === "RESTAURANT_MANAGER") {
    return "/restaurant";
  }

  if (role === "ORDER_OPERATOR") {
    return "/operations/orders";
  }

  return "/operations/orders";
}

export function canAccessNavigationPath(role: MembershipRole, href: string) {
  if (
    href === "/platform" ||
    href === "/platform/companies" ||
    href === "/platform/users/reassign" ||
    href === "/platform/users/memberships" ||
    href === "/platform/uat-reset"
  ) {
    return canAccessRole(role, platformAdminRoles);
  }

  if (href === "/company") {
    return role === "COMPANY_OWNER" || role === "COMPANY_MANAGER";
  }

  if (href === "/restaurant") {
    return role === "RESTAURANT_MANAGER";
  }

  if (href === "/operations/orders") {
    return role === "RESTAURANT_MANAGER" || role === "ORDER_OPERATOR";
  }

  if (href === "/operations/menu") {
    return role === "RESTAURANT_MANAGER";
  }

  if (href === "/operations/inventory") {
    return role === "RESTAURANT_MANAGER";
  }

  if (href === "/audit-logs") {
    return canAccessRole(role, [
      ...platformAdminRoles,
      ...companyAdminRoles,
      ...restaurantAdminRoles,
    ]);
  }

  return true;
}

export function formatRole(role: MembershipRole) {
  return role.replaceAll("_", " ");
}
