import type { MembershipRole } from "@/lib/staff-auth";

export const platformAdminRoles = ["PLATFORM_ADMIN"] satisfies MembershipRole[];

export const companyAdminRoles = ["COMPANY_OWNER"] satisfies MembershipRole[];

export const restaurantAdminRoles = [
  "RESTAURANT_MANAGER",
] satisfies MembershipRole[];

export const operationalRoles = [
  ...restaurantAdminRoles,
  "ORDER_OPERATOR",
] satisfies MembershipRole[];

export const auditLogRoles = [
  ...platformAdminRoles,
  ...companyAdminRoles,
  ...restaurantAdminRoles,
] satisfies MembershipRole[];

export type StaffNavigationAccess =
  | "COMPANY_ADMIN"
  | "PLATFORM_ADMIN"
  | "RESTAURANT_ADMIN"
  | "RESTAURANT_OPERATIONS";

export function canAccessRole(
  role: MembershipRole | null | undefined,
  allowedRoles: MembershipRole[],
) {
  return Boolean(role && allowedRoles.includes(role));
}

export function canAccessNavigation(
  role: MembershipRole,
  access: StaffNavigationAccess,
) {
  if (access === "PLATFORM_ADMIN") {
    return canAccessRole(role, platformAdminRoles);
  }

  if (access === "COMPANY_ADMIN") {
    return role === "COMPANY_OWNER";
  }

  if (access === "RESTAURANT_ADMIN") {
    return role === "RESTAURANT_MANAGER";
  }

  return canAccessRole(role, operationalRoles);
}

export function formatRole(role: MembershipRole) {
  return role.replaceAll("_", " ");
}
