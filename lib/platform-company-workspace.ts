export type PlatformCompanyWorkspaceDestination =
  | "details"
  | "domains"
  | "staffInvite"
  | "subscription"
  | "users";

const destinationPaths: Record<PlatformCompanyWorkspaceDestination, string> = {
  details: "",
  domains: "domains",
  staffInvite: "staff/invite",
  subscription: "subscription",
  users: "users",
};

function encodeSlug(slug: string) {
  return encodeURIComponent(slug.trim().toLowerCase());
}

export function getPlatformCompanyWorkspaceBaseHref(companySlug: string) {
  return `/platform/companies/${encodeSlug(companySlug)}`;
}

export function getPlatformCompanyWorkspaceHref(
  companySlug: string,
  destination: PlatformCompanyWorkspaceDestination,
) {
  const baseHref = getPlatformCompanyWorkspaceBaseHref(companySlug);
  const path = destinationPaths[destination];

  return path ? `${baseHref}/${path}` : baseHref;
}

export function getPlatformCompanyUserHref(
  companySlug: string,
  membershipId: string,
) {
  return `${getPlatformCompanyWorkspaceHref(companySlug, "users")}/${encodeURIComponent(membershipId)}`;
}
