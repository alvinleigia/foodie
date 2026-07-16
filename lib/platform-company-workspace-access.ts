import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  getPlatformCompanyUserHref,
  getPlatformCompanyWorkspaceHref,
  type PlatformCompanyWorkspaceDestination,
} from "@/lib/platform-company-workspace";
import { platformAdminRoles } from "@/lib/role-access";
import { getPlatformCompanyBySlugOrId } from "@/lib/saas-admin";

type PlatformCompanyWorkspaceAccessOptions = {
  destination: PlatformCompanyWorkspaceDestination;
  identifier: string;
  membershipId?: string;
};

export async function requirePlatformCompanyWorkspaceAccess({
  destination,
  identifier,
  membershipId,
}: PlatformCompanyWorkspaceAccessOptions) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    redirect("/staff/login");
  }

  const company = await getPlatformCompanyBySlugOrId(identifier);

  if (!company) {
    notFound();
  }

  const canonicalHref = membershipId
    ? getPlatformCompanyUserHref(company.slug, membershipId)
    : getPlatformCompanyWorkspaceHref(company.slug, destination);

  if (identifier !== company.slug) {
    redirect(canonicalHref);
  }

  return { company, session };
}
