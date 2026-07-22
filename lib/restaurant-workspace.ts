export type RestaurantWorkspaceDestination =
  | "auditLogs"
  | "cashDrawer"
  | "dashboard"
  | "integrations"
  | "inventory"
  | "kds"
  | "menu"
  | "order"
  | "orderingPoint"
  | "orders"
  | "settings"
  | "staff"
  | "staffInvite"
  | "staffReassign";

export type RestaurantWorkspacePageProps = {
  params: Promise<{ restaurantSlug: string }>;
};

const destinationPaths: Record<RestaurantWorkspaceDestination, string> = {
  auditLogs: "audit-logs",
  cashDrawer: "cash-drawer",
  dashboard: "",
  integrations: "integrations",
  inventory: "inventory",
  kds: "kds",
  menu: "menu",
  order: "order",
  orderingPoint: "ordering-point",
  orders: "orders",
  settings: "settings",
  staff: "staff",
  staffInvite: "staff/invite",
  staffReassign: "staff/reassign",
};

export function getRestaurantWorkspaceBaseHref(restaurantSlug: string) {
  return `/restaurants/${encodeURIComponent(restaurantSlug.trim().toLowerCase())}`;
}

export function getRestaurantWorkspaceHref(
  restaurantSlug: string,
  destination: RestaurantWorkspaceDestination,
) {
  const baseHref = getRestaurantWorkspaceBaseHref(restaurantSlug);
  const destinationPath = destinationPaths[destination];

  return destinationPath ? `${baseHref}/${destinationPath}` : baseHref;
}

export function getRestaurantStaffMemberHref(
  restaurantSlug: string,
  membershipId: string,
) {
  return `${getRestaurantWorkspaceHref(restaurantSlug, "staff")}/${encodeURIComponent(membershipId)}`;
}
