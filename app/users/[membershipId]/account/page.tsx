import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { UserAccountDetailsForm } from "@/components/admin/UserAccountDetailsForm";
import { resolveStaffHomePath } from "@/lib/staff-home";
import { getUserAccountForEditor } from "@/lib/user-account";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeReturnTo(
  value: string | string[] | undefined,
  fallback: string,
) {
  const returnTo = getSearchParam(value);

  if (
    !returnTo ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("://")
  ) {
    return fallback;
  }

  return returnTo;
}

function getActivePath(returnTo: string, fallback: string) {
  const companyRestaurantStaffMatch = returnTo.match(
    /^(\/companies\/[^/]+\/restaurants\/[^/]+\/staff)(?:\/|$)/,
  );

  if (companyRestaurantStaffMatch) {
    return companyRestaurantStaffMatch[1];
  }

  const companyUsersMatch = returnTo.match(
    /^(\/companies\/[^/]+\/users)(?:\/|$)/,
  );

  if (companyUsersMatch) {
    return companyUsersMatch[1];
  }

  const restaurantStaffMatch = returnTo.match(
    /^(\/restaurants\/[^/]+\/staff)(?:\/|$)/,
  );

  if (restaurantStaffMatch) {
    return restaurantStaffMatch[1];
  }

  if (returnTo.startsWith("/platform/companies")) {
    return "/platform/companies";
  }

  if (returnTo.startsWith("/platform/users")) {
    return "/platform/users/memberships";
  }

  return fallback;
}

export default async function UserAccountDetailsPage(
  props: PageProps<"/users/[membershipId]/account">,
) {
  const session = await auth();

  if (!session?.user?.role) {
    redirect("/staff/login");
  }

  const { membershipId } = await props.params;
  const target = await getUserAccountForEditor(membershipId, session.user);

  if (!target) {
    notFound();
  }

  const searchParams = await props.searchParams;
  const homePath = await resolveStaffHomePath(session.user);

  if (!homePath) {
    notFound();
  }

  const backHref = getSafeReturnTo(searchParams.returnTo, homePath);

  return (
    <SaasAdminShell
      activePath={getActivePath(backHref, homePath)}
      eyebrow="User Account"
      title="Edit account details"
      description={`Correct account details for ${target.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <UserAccountDetailsForm
        apiPath={`/api/users/${target.membershipId}/account`}
        backHref={backHref}
        user={target}
      />
    </SaasAdminShell>
  );
}
