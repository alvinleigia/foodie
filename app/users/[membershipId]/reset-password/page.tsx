import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { PasswordResetLinkPanel } from "@/components/admin/PasswordResetLinkPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getPasswordResetTargetForViewer } from "@/lib/password-reset";
import { resolveStaffHomePath } from "@/lib/staff-home";

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

export default async function UserPasswordResetLinkPage(
  props: PageProps<"/users/[membershipId]/reset-password">,
) {
  const session = await auth();

  if (!session?.user?.role) {
    redirect("/staff/login");
  }

  const { membershipId } = await props.params;
  const target = await getPasswordResetTargetForViewer(membershipId, session.user);

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
      eyebrow="User Security"
      title="Reset password"
      description={`Create a one-time password reset link for ${target.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <PasswordResetLinkPanel
        apiPath={`/api/users/${target.membershipId}/password-reset`}
        backHref={backHref}
        target={target}
      />
    </SaasAdminShell>
  );
}
