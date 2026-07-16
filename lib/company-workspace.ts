export type CompanyWorkspaceDestination =
  | "auditLogs"
  | "dashboard"
  | "integrations"
  | "restaurantNew"
  | "restaurants"
  | "userInvite"
  | "userReassign"
  | "users";

export type CompanyRestaurantDestination =
  | "integrations"
  | "settings"
  | "staff"
  | "staffInvite";

export type CompanyWorkspacePageProps = {
  params: Promise<{ companySlug: string }>;
};

const companyDestinationPath: Record<CompanyWorkspaceDestination, string> = {
  auditLogs: "audit-logs",
  dashboard: "",
  integrations: "integrations",
  restaurantNew: "restaurants/new",
  restaurants: "restaurants",
  userInvite: "users/invite",
  userReassign: "users/reassign",
  users: "users",
};

const companyRestaurantDestinationPath: Record<
  CompanyRestaurantDestination,
  string
> = {
  integrations: "integrations",
  settings: "",
  staff: "staff",
  staffInvite: "staff/invite",
};

function encodeSlug(slug: string) {
  return encodeURIComponent(slug.trim().toLowerCase());
}

export function getCompanyWorkspaceBaseHref(companySlug: string) {
  return `/companies/${encodeSlug(companySlug)}`;
}

export function getCompanyWorkspaceHref(
  companySlug: string,
  destination: CompanyWorkspaceDestination,
) {
  const baseHref = getCompanyWorkspaceBaseHref(companySlug);
  const path = companyDestinationPath[destination];

  return path ? `${baseHref}/${path}` : baseHref;
}

export function getCompanyUserHref(
  companySlug: string,
  membershipId: string,
) {
  return `${getCompanyWorkspaceHref(companySlug, "users")}/${encodeURIComponent(membershipId)}`;
}

export function getCompanyRestaurantHref(
  companySlug: string,
  restaurantSlug: string,
  destination: CompanyRestaurantDestination,
) {
  const baseHref = `${getCompanyWorkspaceHref(companySlug, "restaurants")}/${encodeSlug(restaurantSlug)}`;
  const path = companyRestaurantDestinationPath[destination];

  return path ? `${baseHref}/${path}` : baseHref;
}
