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
  "cash_drawer.adjust",
  "cash_drawer.close",
  "customers.search",
  "menu.manage",
  "inventory.manage",
  "reports.view",
  "audit.view",
  "staff.manage",
  "time_clock.use",
  "time_clock.manage",
  "staff_schedule.view",
  "staff_schedule.manage",
  "restaurant.settings",
  "integrations.manage",
  "ordering_point.manage",
] as const;

export type StaffPermission = (typeof staffPermissions)[number];

export type StaffPermissionOverrides = Partial<Record<StaffPermission, boolean>>;

export type StaffPermissionDefinition = {
  description: string;
  group: "Administration" | "Customers" | "Orders" | "Payments" | "Workforce";
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
    permission: "cash_drawer.adjust",
    group: "Payments",
    label: "Adjust cash drawer",
    description: "Record paid-in and paid-out cash movements with a reason.",
  },
  {
    permission: "cash_drawer.close",
    group: "Payments",
    label: "Close and reconcile cash drawer",
    description: "Count cash, review the variance and close a drawer session.",
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
    permission: "time_clock.use",
    group: "Workforce",
    label: "Use time clock",
    description: "Clock in and out and record personal breaks.",
  },
  {
    permission: "time_clock.manage",
    group: "Workforce",
    label: "View staff shifts",
    description: "Review active and completed staff shift records.",
  },
  {
    permission: "staff_schedule.view",
    group: "Workforce",
    label: "View own schedule",
    description: "View upcoming shifts assigned to the staff member.",
  },
  {
    permission: "staff_schedule.manage",
    group: "Workforce",
    label: "Manage staff schedule",
    description: "Create, edit and cancel restaurant staff shifts.",
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
  "time_clock.use",
  "staff_schedule.view",
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
  basePermissions?: readonly StaffPermission[] | null,
) {
  const overrides = normalizeStaffPermissionOverrides(permissionOverrides);
  const enabledByDefault = basePermissions
    ? basePermissions.includes(permission)
    : isPermissionEnabledByRole(role, permission);

  return overrides[permission] ?? enabledByDefault;
}

export function resolveStaffPermissions(
  role: MembershipRole,
  permissionOverrides: unknown,
  basePermissions?: readonly StaffPermission[] | null,
) {
  return staffPermissions.filter((permission) =>
    hasStaffPermission(role, permissionOverrides, permission, basePermissions),
  );
}

export function buildStaffPermissionOverrides(
  role: MembershipRole,
  permissions: readonly StaffPermission[],
  basePermissions?: readonly StaffPermission[] | null,
) {
  const enabledPermissions = new Set(permissions);

  return staffPermissions.reduce<StaffPermissionOverrides>(
    (overrides, permission) => {
      const enabled = enabledPermissions.has(permission);
      const enabledByDefault = basePermissions
        ? basePermissions.includes(permission)
        : isPermissionEnabledByRole(role, permission);

      if (enabled !== enabledByDefault) {
        overrides[permission] = enabled;
      }

      return overrides;
    },
    {},
  );
}
