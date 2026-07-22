import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { canAccessNavigation } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";
import {
  getStaffNavigationItemsForCompany,
  getStaffNavigationItemsForRestaurant,
  staffNavigationItems,
  type StaffNavigationItem,
} from "@/lib/staff-navigation";

type NavigationPolicy = {
  items: StaffNavigationItem[];
  pathPattern: RegExp;
  role: MembershipRole;
};

function getVisibleNavigationItems(policy: NavigationPolicy) {
  return policy.items.filter((item) =>
    canAccessNavigation(policy.role, item.access),
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
    expect(groupFor("Menu Manager")).toBe("management");
    expect(groupFor("Audit logs")).toBe("security");
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
