import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { canAccessNavigation } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";
import {
  resolveStaffPermissions,
  type StaffPermission,
} from "@/lib/staff-permissions";
import { getStaffHomePathForOrganization } from "@/lib/staff-home";
import {
  getStaffNavigationItemsForCompany,
  getStaffNavigationItemsForRestaurant,
  staffNavigationItems,
  type StaffNavigationItem,
} from "@/lib/staff-navigation";

type NavigationPolicy = {
  items: StaffNavigationItem[];
  pathPattern: RegExp;
  permissions?: StaffPermission[];
  role: MembershipRole;
};

function getVisibleNavigationItems(policy: NavigationPolicy) {
  const permissions =
    policy.permissions ?? resolveStaffPermissions(policy.role, null);

  return policy.items.filter((item) =>
    canAccessNavigation(
      policy.role,
      item.access,
      item.permission,
      permissions,
    ),
  );
}

async function doesProxyMatch(url: string) {
  process.env.APP_ROOT_DOMAIN ??= "example.com";

  const { config } = await import("../../proxy");

  return unstable_doesMiddlewareMatch({
    config,
    nextConfig: {},
    url,
  });
}

const navigationPolicies: NavigationPolicy[] = [
  {
    items: staffNavigationItems,
    pathPattern: /^\/platform(?:\/|$)/,
    role: "PLATFORM_ADMIN",
  },
  {
    items: getStaffNavigationItemsForCompany("example-company"),
    pathPattern: /^\/companies\/example-company(?:\/|$)/,
    role: "COMPANY_OWNER",
  },
  {
    items: getStaffNavigationItemsForRestaurant("example-restaurant"),
    pathPattern: /^\/restaurants\/example-restaurant(?:\/|$)/,
    role: "RESTAURANT_MANAGER",
  },
  {
    items: getStaffNavigationItemsForRestaurant("example-restaurant"),
    pathPattern: /^\/restaurants\/example-restaurant(?:\/|$)/,
    role: "ORDER_OPERATOR",
  },
];

test.describe("staff navigation URL policy", () => {
  test("restaurant actions are grouped by workflow", () => {
    const navigation = getStaffNavigationItemsForRestaurant(
      "example-restaurant",
    );
    const groupFor = (label: string) =>
      navigation.find((item) => item.label === label)?.group;

    expect(groupFor("Restaurant")).toBe("overview");
    expect(groupFor("Take order")).toBe("operations");
    expect(groupFor("Orders")).toBe("operations");
    expect(groupFor("Kitchen display")).toBe("operations");
    expect(groupFor("Cash drawer")).toBe("operations");
    expect(groupFor("Restaurant Staff")).toBe("management");
    expect(groupFor("Reports")).toBe("management");
    expect(groupFor("Menu Manager")).toBe("management");
    expect(groupFor("Audit logs")).toBe("security");
  });

  test("custom restaurant permissions expose only matching destinations", () => {
    const visibleItems = getVisibleNavigationItems({
      items: getStaffNavigationItemsForRestaurant("example-restaurant"),
      pathPattern: /^\/restaurants\/example-restaurant(?:\/|$)/,
      permissions: ["reports.view"],
      role: "ORDER_OPERATOR",
    });

    expect(visibleItems.map((item) => item.label)).toEqual(["Reports"]);
    expect(visibleItems[0]?.href).toBe(
      "/restaurants/example-restaurant/reports",
    );
    expect(
      getStaffHomePathForOrganization(
        "ORDER_OPERATOR",
        {
          slug: "example-restaurant",
          type: "RESTAURANT",
        },
        ["reports.view"],
      ),
    ).toBe("/restaurants/example-restaurant/reports");
    expect(
      getStaffHomePathForOrganization(
        "ORDER_OPERATOR",
        {
          slug: "example-restaurant",
          type: "RESTAURANT",
        },
        ["reports.view"],
        { reportsEnabled: false },
      ),
    ).toBeNull();
  });

  test("feature entitlements remove unavailable menu destinations", () => {
    const navigation = getStaffNavigationItemsForRestaurant(
      "example-restaurant",
      { inventoryEnabled: false, reportsEnabled: false },
    );

    expect(navigation.some((item) => item.label === "Inventory")).toBe(false);
    expect(navigation.some((item) => item.label === "Reports")).toBe(false);
  });

  test("every top-level restaurant menu item matches its page permission", () => {
    const pagePolicies = new Map<string, [string, StaffPermission]>([
      ["Restaurant", ["app/restaurants/[restaurantSlug]/page.tsx", "restaurant.dashboard"]],
      ["Restaurant Staff", ["app/restaurants/[restaurantSlug]/staff/page.tsx", "staff.manage"]],
      ["Restaurant settings", ["app/restaurants/[restaurantSlug]/settings/page.tsx", "restaurant.settings"]],
      ["Ordering Point", ["app/restaurants/[restaurantSlug]/ordering-point/page.tsx", "ordering_point.manage"]],
      ["Restaurant Integrations", ["app/restaurants/[restaurantSlug]/integrations/page.tsx", "integrations.manage"]],
      ["Take order", ["app/restaurants/[restaurantSlug]/order/page.tsx", "orders.create"]],
      ["Orders", ["app/restaurants/[restaurantSlug]/orders/page.tsx", "orders.view"]],
      ["Kitchen display", ["app/restaurants/[restaurantSlug]/kds/page.tsx", "orders.view"]],
      ["Cash drawer", ["app/restaurants/[restaurantSlug]/cash-drawer/page.tsx", "cash_drawer.open"]],
      ["Reports", ["app/restaurants/[restaurantSlug]/reports/page.tsx", "reports.view"]],
      ["Menu Manager", ["app/restaurants/[restaurantSlug]/menu/page.tsx", "menu.manage"]],
      ["Inventory", ["app/restaurants/[restaurantSlug]/inventory/page.tsx", "inventory.manage"]],
      ["Audit logs", ["app/restaurants/[restaurantSlug]/audit-logs/page.tsx", "audit.view"]],
    ]);
    const navigation = getStaffNavigationItemsForRestaurant(
      "example-restaurant",
    );

    expect(navigation).toHaveLength(pagePolicies.size);

    for (const item of navigation) {
      const policy = pagePolicies.get(item.label);
      expect(policy, item.label).toBeDefined();

      const [fileName, permission] = policy!;
      const pageSource = readFileSync(fileName, "utf8");
      expect(item.permission, item.label).toBe(permission);
      expect(pageSource, fileName).toContain(
        `requiredPermission: "${permission}"`,
      );
    }
  });

  for (const policy of navigationPolicies) {
    test(`${policy.role} links stay in the scoped workspace`, () => {
      const visibleItems = getVisibleNavigationItems(policy);

      expect(visibleItems.length).toBeGreaterThan(0);

      for (const item of visibleItems) {
        expect(item.href, `${policy.role}: ${item.label}`).toMatch(
          policy.pathPattern,
        );
      }
    });
  }

  for (const route of [
    "audit-logs",
    "company",
    "dashboard",
    "operations",
    "restaurant",
  ]) {
    test(`legacy /${route} route is not published`, () => {
      expect(existsSync(resolve(process.cwd(), "app", route))).toBe(false);
    });
  }

  for (const route of [
    "/companies/example-company",
    "/platform",
    "/restaurants/example-restaurant/orders",
  ]) {
    test(`staff route ${route} is confined to the administration domain`, async () => {
      expect(await doesProxyMatch(route)).toBe(true);
    });
  }

  for (const route of [
    "/account",
    "/customer/login",
    "/order/example-restaurant",
  ]) {
    test(`customer route ${route} remains available on white-label domains`, async () => {
      expect(await doesProxyMatch(route)).toBe(false);
    });
  }
});
