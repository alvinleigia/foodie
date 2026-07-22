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
  group: StaffNavigationGroup;
  href: string;
  label: string;
  description: string;
  permission?: StaffPermission;
};

export type StaffNavigationGroup =
  | "overview"
  | "operations"
  | "management"
  | "security"
  | "system";

type NavigationDefinition<Destination extends string> = Omit<
  StaffNavigationItem,
  "href"
> & {
  destination: Destination;
};

export const staffNavigationItems: StaffNavigationItem[] = [
  {
    access: "PLATFORM_ADMIN",
    group: "overview",
    href: "/platform",
    label: "Platform",
    description: "SaaS dashboard.",
  },
  {
    access: "PLATFORM_ADMIN",
    group: "management",
    href: "/platform/companies",
    label: "Companies",
    description: "Parent company tenants.",
  },
  {
    access: "PLATFORM_ADMIN",
    group: "management",
    href: "/platform/users/memberships",
    label: "User Memberships",
    description: "Review cross-tenant access.",
  },
  {
    access: "PLATFORM_ADMIN",
    group: "security",
    href: "/platform/audit-logs",
    label: "Audit logs",
    description: "Security and change history.",
  },
];

export const uatResetNavigationItem: StaffNavigationItem = {
  access: "PLATFORM_ADMIN",
  group: "system",
  href: "/platform/uat-reset",
  label: "UAT Reset",
  description: "Clear testing data.",
};

const companyNavigation: Array<
  NavigationDefinition<CompanyWorkspaceDestination>
> = [
  {
    access: "COMPANY_ADMIN",
    group: "overview",
    destination: "dashboard",
    label: "Company",
    description: "Company dashboard.",
  },
  {
    access: "COMPANY_ADMIN",
    group: "management",
    destination: "restaurants",
    label: "Company Restaurants",
    description: "Manage company restaurants.",
  },
  {
    access: "COMPANY_ADMIN",
    group: "management",
    destination: "users",
    label: "Company Users",
    description: "Manage user access.",
  },
  {
    access: "COMPANY_ADMIN",
    group: "management",
    destination: "integrations",
    label: "Company Integrations",
    description: "Email and payment services.",
  },
  {
    access: "COMPANY_ADMIN",
    group: "security",
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
    group: "overview",
    destination: "dashboard",
    label: "Restaurant",
    description: "Restaurant dashboard.",
    permission: "restaurant.dashboard",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "staff",
    label: "Restaurant Staff",
    description: "Manage restaurant staff.",
    permission: "staff.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "settings",
    label: "Restaurant settings",
    description: "Restaurant details and tax configuration.",
    permission: "restaurant.settings",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "orderingPoint",
    label: "Ordering Point",
    description: "Manage the restaurant QR entry point.",
    permission: "ordering_point.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "integrations",
    label: "Restaurant Integrations",
    description: "Inherited and custom services.",
    permission: "integrations.manage",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    group: "operations",
    destination: "order",
    label: "Take order",
    description: "Create a restaurant order.",
    permission: "orders.create",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    group: "operations",
    destination: "orders",
    label: "Orders",
    description: "Live order operations.",
    permission: "orders.view",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    group: "operations",
    destination: "kds",
    label: "Kitchen display",
    description: "Kitchen and bar preparation tickets.",
    permission: "orders.view",
  },
  {
    access: "RESTAURANT_OPERATIONS",
    group: "operations",
    destination: "cashDrawer",
    label: "Cash drawer",
    description: "Open and manage the active till.",
    permission: "cash_drawer.open",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "menu",
    label: "Menu Manager",
    description: "Categories and products.",
    permission: "menu.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "management",
    destination: "inventory",
    label: "Inventory",
    description: "Stock control.",
    permission: "inventory.manage",
  },
  {
    access: "RESTAURANT_ADMIN",
    group: "security",
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
