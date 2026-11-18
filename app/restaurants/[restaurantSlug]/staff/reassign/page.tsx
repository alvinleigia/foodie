import { ReassignExistingUserForm } from "@/components/admin/ReassignExistingUserForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  listRestaurantReassignableUsers,
  listRestaurantReassignmentTargets,
} from "@/lib/saas-admin";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import { getMembershipAccessOptions } from "@/lib/membership-access";
import { getCompanyRestaurantHref, getCompanyWorkspaceHref } from "@/lib/company-workspace";

type RestaurantStaffReassignPageProps = {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RestaurantStaffReassignPage({
  params,
  searchParams,
}: RestaurantStaffReassignPageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      destination: "staffReassign",
      requiredPermission: "staff.manage",
      restaurantSlug,
    });
  const [targets, users, query, memberships] = await Promise.all([
    listRestaurantReassignmentTargets(access.tenantContext),
    listRestaurantReassignableUsers(access.tenantContext),
    searchParams,
    getMembershipAccessOptions(session.user.id, { type: "PLATFORM" }),
  ]);
  const staffHref = getRestaurantWorkspaceHref(access.restaurant.slug, "staff");
  const company = targets[0];
  const companyAccess = company && memberships.find((membership) =>
    membership.role === "COMPANY_OWNER" && membership.organizationType === "COMPANY" &&
    membership.organizationId === company.id,
  );
  const companyAssignment = companyAccess ? {
    membershipId: companyAccess.membershipId,
    href: `${getCompanyWorkspaceHref(company.slug, "userReassign")}?${new URLSearchParams({
      restaurantSlug: access.restaurant.slug,
      role: "ORDER_OPERATOR",
      deactivateExisting: "false",
      returnTo: getCompanyRestaurantHref(company.slug, access.restaurant.slug, "staff"),
    })}`,
  } : undefined;

  return (
    <SaasAdminShell
      activePath={staffHref}
      eyebrow="Staff"
      title="Reactivate or update staff access"
      description="Manage accepted accounts already linked to this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <ReassignExistingUserForm
        scope="restaurant"
        companyAssignment={companyAssignment}
        apiPath="/api/tenant/admin/staff/reassign"
        backHref={staffHref}
        defaultDeactivateExisting={false}
        initialCompanyId={targets[0]?.id}
        initialIdentifier={getSearchParam(query.identifier)}
        initialRestaurantId={snapshot.organization.id}
        initialRole="ORDER_OPERATOR"
        roleOptions={[
          { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
          { label: "Order Operator", value: "ORDER_OPERATOR" },
        ]}
        targets={targets}
        users={users}
      />
    </SaasAdminShell>
  );
}

