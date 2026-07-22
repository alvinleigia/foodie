import type { MembershipRole } from "@/lib/staff-auth";

export const staffPermissions = [
  "restaurant.dashboard",
  "orders.view",
  "orders.create",
  "orders.update_status",
  "orders.correct_status",
  "orders.cancel",
  "orders.adjust",
  "payments.collect",
  "payments.refund",
  "cash_drawer.open",
  "customers.search",
  "menu.manage",
  "inventory.manage",
  "reports.view",
  "audit.view",
  "staff.manage",
  "restaurant.settings",
  "integrations.manage",
  "ordering_point.manage",
] as const;

export type StaffPermission = (typeof staffPermissions)[number];

export type StaffPermissionOverrides = Partial<Record<StaffPermission, boolean>>;

export type StaffPermissionDefinition = {
  description: string;
  group: "Administration" | "Customers" | "Orders" | "Payments";
  label: string;
  permission: StaffPermission;
};

export const staffPermissionDefinitions: StaffPermissionDefinition[] = [
  {
    permission: "restaurant.dashboard",
    group: "Administration",
    label: "View restaurant dashboard",
    description: "View the restaurant overview and operational summaries.",
  },
  {
    permission: "orders.view",
    group: "Orders",
    label: "View orders",
    description: "View active and completed restaurant orders.",
  },
  {
    permission: "orders.create",
    group: "Orders",
    label: "Take orders",
    description: "Create restaurant orders for guests or linked customers.",
  },
  {
    permission: "orders.update_status",
    group: "Orders",
    label: "Update order status",
    description: "Move orders and items through normal fulfilment stages.",
  },
  {
    permission: "orders.correct_status",
    group: "Orders",
    label: "Correct order status",
    description: "Apply exceptional corrections to order and item statuses.",
  },
  {
    permission: "orders.cancel",
    group: "Orders",
    label: "Cancel orders",
    description: "Request staff cancellations subject to manager approval rules.",
  },
  {
    permission: "orders.adjust",
    group: "Orders",
    label: "Apply adjustments",
    description: "Apply discounts, comps and other bill adjustments.",
  },
  {
    permission: "payments.collect",
    group: "Payments",
    label: "Collect payments",
    description: "Record cash payments or start an online checkout.",
  },
  {
    permission: "payments.refund",
    group: "Payments",
    label: "Issue refunds",
    description: "Request full or partial refunds subject to manager approval rules.",
  },
  {
    permission: "cash_drawer.open",
    group: "Payments",
    label: "Open cash drawer",
    description: "View and open the cash drawer with its opening float.",
  },
  {
    permission: "customers.search",
    group: "Customers",
    label: "Search customers",
    description: "Search and link restaurant customers while taking an order.",
  },
  {
    permission: "menu.manage",
    group: "Administration",
    label: "Manage menu",
    description: "Create and update categories, products and add-ons.",
  },
  {
    permission: "inventory.manage",
    group: "Administration",
    label: "Manage inventory",
    description: "Review stock and update inventory quantities.",
  },
  {
    permission: "reports.view",
    group: "Administration",
    label: "View reports",
    description: "View and export restaurant operational reports.",
  },
  {
    permission: "audit.view",
    group: "Administration",
    label: "View audit logs",
    description: "Review the restaurant security and change history.",
  },
  {
    permission: "staff.manage",
    group: "Administration",
    label: "Manage staff",
    description: "Invite staff and change their access or permissions.",
  },
  {
    permission: "restaurant.settings",
    group: "Administration",
    label: "Manage restaurant settings",
    description: "Update restaurant identity, tax and fulfilment settings.",
  },
  {
    permission: "integrations.manage",
    group: "Administration",
    label: "Manage integrations",
    description: "Configure payment, email and social sign-in integrations.",
  },
  {
    permission: "ordering_point.manage",
    group: "Administration",
    label: "Manage ordering point",
    description: "Configure the restaurant ordering link and QR entry point.",
  },
];

const allPermissions = new Set<StaffPermission>(staffPermissions);

const orderOperatorDefaults = new Set<StaffPermission>([
  "orders.view",
  "orders.create",
  "orders.update_status",
  "orders.cancel",
  "orders.adjust",
  "payments.collect",
  "payments.refund",
  "cash_drawer.open",
  "customers.search",
]);

export function isStaffPermission(value: string): value is StaffPermission {
  return allPermissions.has(value as StaffPermission);
}

export function normalizeStaffPermissionOverrides(
  value: unknown,
): StaffPermissionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<StaffPermissionOverrides>(
    (overrides, [permission, enabled]) => {
      if (isStaffPermission(permission) && typeof enabled === "boolean") {
        overrides[permission] = enabled;
      }

      return overrides;
    },
    {},
  );
}

export function isPermissionEnabledByRole(
  role: MembershipRole,
  permission: StaffPermission,
) {
  if (role === "ORDER_OPERATOR") {
    return orderOperatorDefaults.has(permission);
  }

  return role !== "COMPANY_MANAGER";
}

export function hasStaffPermission(
  role: MembershipRole,
  permissionOverrides: unknown,
  permission: StaffPermission,
) {
  const overrides = normalizeStaffPermissionOverrides(permissionOverrides);

  return overrides[permission] ?? isPermissionEnabledByRole(role, permission);
}

export function resolveStaffPermissions(
  role: MembershipRole,
  permissionOverrides: unknown,
) {
  return staffPermissions.filter((permission) =>
    hasStaffPermission(role, permissionOverrides, permission),
  );
}

export function buildStaffPermissionOverrides(
  role: MembershipRole,
  permissions: readonly StaffPermission[],
) {
  const enabledPermissions = new Set(permissions);

  return staffPermissions.reduce<StaffPermissionOverrides>(
    (overrides, permission) => {
      const enabled = enabledPermissions.has(permission);

      if (enabled !== isPermissionEnabledByRole(role, permission)) {
        overrides[permission] = enabled;
      }

      return overrides;
    },
    {},
  );
}
