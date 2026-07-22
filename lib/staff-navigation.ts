import {
  getCompanyWorkspaceHref,
  type CompanyWorkspaceDestination,
} from "@/lib/company-workspace";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspaceDestination,
} from "@/lib/restaurant-workspace";
import type { StaffNavigationAccess } from "@/lib/role-access";
import type { StaffPermission } from "@/lib/staff-permissions";

export type StaffNavigationItem = {
  access: StaffNavigationAccess;
  href: string;
  label: string;
  description: string;
  permission?: StaffPermission;
};

type NavigationDefinition<Destination extends string> = Omit<
  StaffNavigationItem,
  "href"
> & {
  destination: Destination;
};

export const staffNavigationItems: StaffNavigationItem[] = [
  {
    access: "PLATFORM_ADMIN",
    href: "/platform",
    label: "Platform",
    description: "SaaS dashboard.",
  },
  {
    access: "PLATFORM_ADMIN",
    href: "/platform/companies",
    label: "Companies",
    description: "Parent company tenants.",
  },
  {
    access: "PLATFORM_ADMIN",
    href: "/platform/users/memberships",
    label: "User Memberships",
    description: "Review cross-tenant access.",
  },
  {
    access: "PLATFORM_ADMIN",
    href: "/platform/audit-logs",
    label: "Audit logs",
    description: "Security and change history.",
  },
];

export const uatResetNavigationItem: StaffNavigationItem = {
  access: "PLATFORM_ADMIN",
  href: "/platform/uat-reset",
  label: "UAT Reset",
  description: "Clear testing data.",
};

const companyNavigation: Array<
  NavigationDefinition<CompanyWorkspaceDestination>
> = [
  {
    access: "COMPANY_ADMIN",
    destination: "dashboard",
    label: "Company",
    description: "Company dashboard.",
  },
  {
    access: "COMPANY_ADMIN",
    destination: "restaurants",
    label: "Company Restaurants",
    description: "Manage company restaurants.",
  },
  {
    access: "COMPANY_ADMIN",
    destination: "users",
    label: "Company Users",
    description: "Manage user access.",
  },
  {
    access: "COMPANY_ADMIN",
    destination: "integrations",
    label: "Company Integrations",
    description: "Email and payment services.",
  },
  {
    access: "COMPANY_ADMIN",
    destination: "auditLogs",
    label: "Audit logs",
    description: "Security and change history.",
  },
];

const restaurantNavigation: Array<
  NavigationDefinition<RestaurantWorkspaceDestination>
> = [
  {
    access: "RESTAURANT_ADMIN",
    destination: "dashboard",
    label: "Restaurant",
    description: "Restaurant dashboard.",
    permission: "restaurant.dashboard",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "staff",
    label: "Restaurant Staff",
    description: "Manage restaurant staff.",
    permission: "staff.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "orderingPoint",
    label: "Ordering Point",
    description: "Manage the restaurant QR entry point.",
    permission: "ordering_point.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "integrations",
    label: "Restaurant Integrations",
    description: "Inherited and custom services.",
    permission: "integrations.manage",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    destination: "order",
    label: "Take order",
    description: "Create a restaurant order.",
    permission: "orders.create",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    destination: "orders",
    label: "Orders",
    description: "Live order operations.",
    permission: "orders.view",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "menu",
    label: "Menu Manager",
    description: "Categories and products.",
    permission: "menu.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "inventory",
    label: "Inventory",
    description: "Stock control.",
    permission: "inventory.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    destination: "auditLogs",
    label: "Audit logs",
    description: "Security and change history.",
    permission: "audit.view",
  },
];

export function getStaffNavigationItemsForCompany(companySlug: string) {
  return companyNavigation.map(({ destination, ...item }) => ({
    ...item,
    href: getCompanyWorkspaceHref(companySlug, destination),
  }));
}

export function getStaffNavigationItemsForRestaurant(
  restaurantSlug: string,
  options: { inventoryEnabled?: boolean } = {},
) {
  const navigation =
    options.inventoryEnabled === false
      ? restaurantNavigation.filter(({ destination }) => destination !== "inventory")
      : restaurantNavigation;

  return navigation.map(({ destination, ...item }) => ({
    ...item,
    href: getRestaurantWorkspaceHref(restaurantSlug, destination),
  }));
}
