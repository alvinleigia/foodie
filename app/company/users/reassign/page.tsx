import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ReassignExistingUserForm } from "@/components/admin/ReassignExistingUserForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import {
  listCompanyReassignableUsers,
  listCompanyReassignmentTargets,
} from "@/lib/saas-admin";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialRole(value: string | string[] | undefined) {
  const role = getSearchParam(value);

  if (
    role === "COMPANY_OWNER" ||
    role === "RESTAURANT_MANAGER" ||
    role === "ORDER_OPERATOR"
  ) {
    return role;
  }

  return undefined;
}

function getSafeReturnTo(value: string | string[] | undefined) {
  const returnTo = getSearchParam(value);

  if (!returnTo) {
    return "/company/users";
  }

  if (
    returnTo === "/company/users" ||
    /^\/company\/restaurants\/[0-9a-f-]{36}\/staff$/i.test(returnTo) ||
    /^\/company\/restaurants\/[0-9a-f-]{36}\/locations\/[0-9a-f-]{36}\/staff$/i.test(
      returnTo,
    )
  ) {
    return returnTo;
  }

  return "/company/users";
}

export default async function CompanyUserReassignPage(
  props: PageProps<"/company/users/reassign">,
) {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  const [targets, users] = await Promise.all([
    listCompanyReassignmentTargets(session.user.organizationId),
    listCompanyReassignableUsers(session.user.organizationId),
  ]);
  const searchParams = await props.searchParams;
  const backHref = getSafeReturnTo(searchParams.returnTo);
  const initialIdentifier = getSearchParam(searchParams.identifier);
  const initialRestaurantId = getSearchParam(searchParams.restaurantId);
  const initialRole = getInitialRole(searchParams.role);

  return (
    <SaasAdminShell
      activePath="/company/users"
      eyebrow="Company"
      title="Assign existing user"
      description="Move or add access for an accepted user inside this company."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <ReassignExistingUserForm
        apiPath="/api/company/users/reassign"
        backHref={backHref}
        defaultDeactivateExisting
        initialCompanyId={session.user.organizationId}
        initialIdentifier={initialIdentifier}
        initialRestaurantId={initialRestaurantId}
        initialRole={initialRole ?? "ORDER_OPERATOR"}
        targets={targets}
        users={users}
      />
    </SaasAdminShell>
  );
}
