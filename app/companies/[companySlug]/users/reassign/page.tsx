import { ReassignExistingUserForm } from "@/components/admin/ReassignExistingUserForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspacePageProps,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";
import {
  listCompanyReassignableUsers,
  listCompanyReassignmentTargets,
} from "@/lib/saas-admin";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getInitialRole(value: string | string[] | undefined) {
  const role = getSearchParam(value);

  return role === "COMPANY_OWNER" ||
    role === "RESTAURANT_MANAGER" ||
    role === "ORDER_OPERATOR"
    ? role
    : undefined;
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

type CompanyUserReassignPageProps = CompanyWorkspacePageProps & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWorkspaceUserReassignPage({
  params,
  searchParams,
}: CompanyUserReassignPageProps) {
  const { companySlug } = await params;
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "userReassign",
  });
  const [targets, users, query] = await Promise.all([
    listCompanyReassignmentTargets(company.id),
    listCompanyReassignableUsers(company.id),
    searchParams,
  ]);
  const usersHref = getCompanyWorkspaceHref(company.slug, "users");
  const initialRestaurantSlug = getSearchParam(query.restaurantSlug)
    ?.trim()
    .toLowerCase();
  const initialRestaurantId = targets
    .flatMap((target) => target.restaurants)
    .find((restaurant) => restaurant.slug === initialRestaurantSlug)?.id;

  return (
    <SaasAdminShell
      activePath={usersHref}
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
        backHref={getSafeReturnTo(query.returnTo, company.slug)}
        defaultDeactivateExisting
        initialCompanyId={company.id}
        initialIdentifier={getSearchParam(query.identifier)}
        initialRestaurantId={initialRestaurantId}
        initialRole={getInitialRole(query.role) ?? "ORDER_OPERATOR"}
        targets={targets}
        users={users}
      />
    </SaasAdminShell>
  );
}
