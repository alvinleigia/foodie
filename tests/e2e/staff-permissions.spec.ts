import { expect, test } from "@playwright/test";

import {
  buildStaffPermissionOverrides,
  hasStaffPermission,
  normalizeStaffPermissionOverrides,
  resolveStaffPermissions,
  staffPermissions,
} from "@/lib/staff-permissions";
import { readFileSync } from "node:fs";

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

  test("stores only differences from role defaults", () => {
    expect(
      buildStaffPermissionOverrides("ORDER_OPERATOR", [
        ...resolveStaffPermissions("ORDER_OPERATOR", null),
        "menu.manage",
      ]),
    ).toEqual({ "menu.manage": true });
    expect(
      buildStaffPermissionOverrides(
        "RESTAURANT_MANAGER",
        staffPermissions.filter(
          (permission) => permission !== "payments.refund",
        ),
      ),
    ).toEqual({ "payments.refund": false });
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

  test("refreshes effective permissions from the validated membership", () => {
    const staffSessionSource = readFileSync("lib/staff-session.ts", "utf8");
    const authSource = readFileSync("auth.ts", "utf8");

    expect(staffSessionSource).toContain(
      "permissionOverrides: memberships.permissionOverrides",
    );
    expect(authSource).toContain("resolveStaffPermissions(");
    expect(authSource).toContain("permissions: (token.permissions ?? [])");
  });

  test("enforces permissions at operational API entry points", () => {
    const expectations = [
      ["app/api/orders/route.ts", 'requireStaffPermission("orders.view")'],
      [
        "app/api/orders/[id]/start/route.ts",
        'requireStaffPermission("orders.update_status")',
      ],
      [
        "app/api/orders/[id]/correct/route.ts",
        'requireStaffPermission("orders.correct_status")',
      ],
      [
        "app/api/orders/[id]/adjustment/route.ts",
        'requireStaffPermission("orders.adjust")',
      ],
      [
        "app/api/orders/[id]/payments/route.ts",
        'requireStaffPermission("payments.collect")',
      ],
      ["app/api/inventory/route.ts", 'requireStaffPermission("inventory.manage")'],
      [
        "app/api/tenant/admin/staff/route.ts",
        'requireStaffPermission("staff.manage")',
      ],
      [
        "app/api/tenant/admin/organization/route.ts",
        'requireStaffPermission("restaurant.settings")',
      ],
      [
        "app/api/tenant/admin/integrations/stripe/route.ts",
        'requireStaffPermission("integrations.manage")',
      ],
    ] as const;

    for (const [fileName, expectedCheck] of expectations) {
      expect(readFileSync(fileName, "utf8"), fileName).toContain(expectedCheck);
    }
  });

  test("enforces permissions in restaurant pages and navigation", () => {
    const workspaceAccessSource = readFileSync(
      "lib/restaurant-workspace-access.ts",
      "utf8",
    );
    const navigationSource = readFileSync("lib/staff-navigation.ts", "utf8");
    const ordersPageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/orders/page.tsx",
      "utf8",
    );
    const menuPageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/menu/page.tsx",
      "utf8",
    );

    expect(workspaceAccessSource).toContain(
      "session.user.permissions.includes(requiredPermission)",
    );
    expect(navigationSource).toContain('permission: "orders.view"');
    expect(navigationSource).toContain('permission: "menu.manage"');
    expect(ordersPageSource).toContain('requiredPermission: "orders.view"');
    expect(menuPageSource).toContain('requiredPermission: "menu.manage"');
  });

  test("exposes manager controls and prevents self lockout", () => {
    const snapshotSource = readFileSync("lib/tenant-admin.ts", "utf8");
    const validationSource = readFileSync(
      "lib/validations/tenant-admin.ts",
      "utf8",
    );
    const staffFormSource = readFileSync(
      "components/admin/TenantAdminForms.tsx",
      "utf8",
    );
    const updateRouteSource = readFileSync(
      "app/api/tenant/admin/staff/[membershipId]/route.ts",
      "utf8",
    );

    expect(snapshotSource).toContain(
      "permissions: resolveStaffPermissions(item.role, item.permissionOverrides)",
    );
    expect(staffFormSource).toContain("staffPermissionDefinitions");
    expect(staffFormSource).toContain("permissions: staff.permissions");
    expect(validationSource).toContain(".array(z.enum(staffPermissions))");
    expect(updateRouteSource).toContain(
      "membershipId === session.user.membershipId",
    );
    expect(updateRouteSource).toContain(
      '!effectivePermissions.includes("staff.manage")',
    );
  });
});
