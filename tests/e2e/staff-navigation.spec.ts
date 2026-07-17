import { expect, test } from "@playwright/test";

import { canAccessNavigationPath } from "@/lib/role-access";
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
    canAccessNavigationPath(policy.role, item.accessPath ?? item.href),
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
});
