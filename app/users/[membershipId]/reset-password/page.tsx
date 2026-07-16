import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { PasswordResetLinkPanel } from "@/components/admin/PasswordResetLinkPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { getPasswordResetTargetForViewer } from "@/lib/password-reset";
import type { MembershipRole } from "@/lib/staff-auth";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeReturnTo(value: string | string[] | undefined, role: MembershipRole) {
  const returnTo = getSearchParam(value);
  const fallback =
    role === "PLATFORM_ADMIN"
      ? "/platform/users/memberships"
      : role === "RESTAURANT_MANAGER"
        ? "/restaurant/staff"
        : "/company/users";

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

function getActivePath(returnTo: string, role: MembershipRole) {
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

  if (returnTo.startsWith("/company/users")) {
    return "/company/users";
  }

  if (returnTo.startsWith("/company")) {
    return "/company";
  }

  if (returnTo.startsWith("/restaurant")) {
    return "/restaurant/staff";
  }

  return role === "PLATFORM_ADMIN"
    ? "/platform/users/memberships"
    : role === "RESTAURANT_MANAGER"
      ? "/restaurant/staff"
      : "/company/users";
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
  const backHref = getSafeReturnTo(searchParams.returnTo, session.user.role);

  return (
    <SaasAdminShell
      activePath={getActivePath(backHref, session.user.role)}
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
