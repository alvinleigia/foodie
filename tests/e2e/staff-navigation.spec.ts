import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

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
});
