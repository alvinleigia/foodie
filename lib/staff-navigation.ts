import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspaceDestination,
} from "@/lib/restaurant-workspace";

export type StaffNavigationItem = {
  accessPath?: string;
  href: string;
  label: string;
  description: string;
};

export const staffNavigationItems: StaffNavigationItem[] = [
  {
    href: "/platform",
    label: "Platform",
    description: "SaaS dashboard.",
  },
  {
    href: "/platform/companies",
    label: "Companies",
    description: "Parent company tenants.",
  },
  {
    href: "/platform/users/memberships",
    label: "User Memberships",
    description: "Review cross-tenant access.",
  },
  {
    href: "/company",
    label: "Company",
    description: "Company dashboard.",
  },
  {
    href: "/company/restaurants",
    label: "Company Restaurants",
    description: "Manage company restaurants.",
  },
  {
    href: "/company/users",
    label: "Company Users",
    description: "Manage user access.",
  },
  {
    href: "/company/integrations",
    label: "Company Integrations",
    description: "Email and payment services.",
  },
  {
    href: "/restaurant",
    label: "Restaurant",
    description: "Restaurant dashboard.",
  },
  {
    href: "/restaurant/staff",
    label: "Restaurant Staff",
    description: "Manage restaurant staff.",
  },
  {
    href: "/restaurant/ordering-point",
    label: "Ordering Point",
    description: "Manage the restaurant QR entry point.",
  },
  {
    href: "/restaurant/integrations",
    label: "Restaurant Integrations",
    description: "Inherited and custom services.",
  },
  {
    href: "/order",
    label: "Take order",
    description: "Create a restaurant order.",
  },
  {
    href: "/operations/orders",
    label: "Orders",
    description: "Live order operations.",
  },
  {
    href: "/operations/menu",
    label: "Menu Manager",
    description: "Categories and products.",
  },
  {
    href: "/operations/inventory",
    label: "Inventory",
    description: "Stock control.",
  },
  {
    href: "/audit-logs",
    label: "Audit logs",
    description: "Security and change history.",
  },
];

export const uatResetNavigationItem: StaffNavigationItem = {
  href: "/platform/uat-reset",
  label: "UAT Reset",
  description: "Clear testing data.",
};

const restaurantDestinationByPath: Partial<
  Record<string, RestaurantWorkspaceDestination>
> = {
  "/audit-logs": "auditLogs",
  "/operations/inventory": "inventory",
  "/operations/menu": "menu",
  "/operations/orders": "orders",
  "/order": "order",
  "/restaurant": "dashboard",
  "/restaurant/integrations": "integrations",
  "/restaurant/ordering-point": "orderingPoint",
  "/restaurant/staff": "staff",
};

export function getStaffNavigationItemsForRestaurant(restaurantSlug: string) {
  return staffNavigationItems.map((item) => {
    const destination = restaurantDestinationByPath[item.href];

    return destination
      ? {
          ...item,
          accessPath: item.href,
          href: getRestaurantWorkspaceHref(restaurantSlug, destination),
        }
      : item;
  });
}
