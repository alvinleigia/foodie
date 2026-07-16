import { notFound } from "next/navigation";

import { CompanyUserAccessForm } from "@/components/admin/CompanyUserAccessForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffUserAccessForm } from "@/components/admin/StaffUserAccessForm";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";
import { getCompanyUserMembership } from "@/lib/saas-admin";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeReturnTo(
  value: string | string[] | undefined,
  companySlug: string,
) {
  const returnTo = getSearchParam(value);
  const usersHref = getCompanyWorkspaceHref(companySlug, "users");
  const companyBaseHref = getCompanyWorkspaceHref(companySlug, "dashboard");

  if (
    returnTo === usersHref ||
    (returnTo?.startsWith(`${companyBaseHref}/restaurants/`) &&
      returnTo.endsWith("/staff"))
  ) {
    return returnTo;
  }

  return usersHref;
}

type CompanyUserAccessPageProps = CompanyWorkspacePageProps & {
  params: Promise<{ companySlug: string; membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWorkspaceUserAccessPage({
  params,
  searchParams,
}: CompanyUserAccessPageProps) {
  const { companySlug, membershipId } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "users",
  });
  const companyUser = await getCompanyUserMembership(company.id, membershipId);

  if (!companyUser) {
    notFound();
  }

  const query = await searchParams;
  const backHref = getSafeReturnTo(query.returnTo, company.slug);
  const apiPath = `/api/company/users/${companyUser.membershipId}`;

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "users")}
      eyebrow="Company"
      title="Edit user access"
      description={`Adjust access for ${companyUser.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      {companyUser.accessScope === "COMPANY" ? (
        <CompanyUserAccessForm apiPath={apiPath} backHref={backHref} user={companyUser} />
      ) : (
        <StaffUserAccessForm apiPath={apiPath} backHref={backHref} user={companyUser} />
      )}
    </SaasAdminShell>
  );
}
