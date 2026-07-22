import { expect, test } from "@playwright/test";

import {
  hasStaffPermission,
  normalizeStaffPermissionOverrides,
  resolveStaffPermissions,
  staffPermissions,
} from "@/lib/staff-permissions";

test.describe("restaurant staff permissions", () => {
  test("preserves the current manager and order operator role defaults", () => {
    expect(resolveStaffPermissions("RESTAURANT_MANAGER", {})).toEqual(
      staffPermissions,
    );
    expect(hasStaffPermission("ORDER_OPERATOR", {}, "orders.create")).toBe(true);
    expect(hasStaffPermission("ORDER_OPERATOR", {}, "orders.update_status")).toBe(
      true,
    );
    expect(hasStaffPermission("ORDER_OPERATOR", {}, "menu.manage")).toBe(false);
    expect(hasStaffPermission("ORDER_OPERATOR", {}, "orders.correct_status")).toBe(
      false,
    );
  });

  test("supports explicit grants and denials over role defaults", () => {
    expect(
      hasStaffPermission(
        "ORDER_OPERATOR",
        { "inventory.manage": true },
        "inventory.manage",
      ),
    ).toBe(true);
    expect(
      hasStaffPermission(
        "RESTAURANT_MANAGER",
        { "payments.refund": false },
        "payments.refund",
      ),
    ).toBe(false);
  });

  test("ignores unknown or malformed stored overrides", () => {
    expect(
      normalizeStaffPermissionOverrides({
        "orders.create": false,
        "orders.unknown": true,
        "menu.manage": "yes",
      }),
    ).toEqual({ "orders.create": false });
    expect(normalizeStaffPermissionOverrides(null)).toEqual({});
    expect(normalizeStaffPermissionOverrides([])).toEqual({});
  });
});
