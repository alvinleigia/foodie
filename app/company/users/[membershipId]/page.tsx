import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { CompanyUserAccessForm } from "@/components/admin/CompanyUserAccessForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffUserAccessForm } from "@/components/admin/StaffUserAccessForm";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import { getCompanyUserMembership } from "@/lib/saas-admin";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeReturnTo(value: string | string[] | undefined) {
  const returnTo = getSearchParam(value);

  if (!returnTo) {
    return "/company/users";
  }

  if (
    returnTo === "/company/users" ||
    /^\/company\/restaurants\/[0-9a-f-]{36}\/staff$/i.test(returnTo) ||
    /^\/company\/restaurants\/[0-9a-f-]{36}\/locations\/[0-9a-f-]{36}\/staff$/i.test(returnTo)
  ) {
    return returnTo;
  }

  return "/company/users";
}

export default async function CompanyUserAccessPage(
  props: PageProps<"/company/users/[membershipId]">,
) {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  const { membershipId } = await props.params;
  const companyUser = await getCompanyUserMembership(
    session.user.organizationId,
    membershipId,
  );

  if (!companyUser) {
    notFound();
  }

  const searchParams = await props.searchParams;
  const usersHref = getSafeReturnTo(searchParams.returnTo);
  const apiPath = `/api/company/users/${companyUser.membershipId}`;

  return (
    <SaasAdminShell
      activePath="/company/users"
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
        <CompanyUserAccessForm
          apiPath={apiPath}
          backHref={usersHref}
          user={companyUser}
        />
      ) : (
        <StaffUserAccessForm
          apiPath={apiPath}
          backHref={usersHref}
          user={companyUser}
        />
      )}
    </SaasAdminShell>
  );
}
