export type RestaurantWorkspaceDestination =
  | "auditLogs"
  | "cashDrawer"
  | "dashboard"
  | "integrations"
  | "inventory"
  | "kds"
  | "menu"
  | "order"
  | "orders"
  | "prepStations"
  | "reports"
  | "settings"
  | "staff"
  | "staffInvite"
  | "staffJobs"
  | "staffReassign"
  | "staffSchedule"
  | "staffShifts"
  | "schedule"
  | "timeClock";

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
  orders: "orders",
  prepStations: "preparation-stations",
  reports: "reports",
  settings: "settings",
  staff: "staff",
  staffInvite: "staff/invite",
  staffJobs: "staff/jobs",
  staffReassign: "staff/reassign",
  staffSchedule: "staff/schedule",
  staffShifts: "staff/shifts",
  schedule: "schedule",
  timeClock: "time-clock",
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
