import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { UserAccountDetailsForm } from "@/components/admin/UserAccountDetailsForm";
import type { MembershipRole } from "@/lib/staff-auth";
import { getUserAccountForEditor } from "@/lib/user-account";

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
  const backHref = getSafeReturnTo(searchParams.returnTo, session.user.role);

  return (
    <SaasAdminShell
      activePath={getActivePath(backHref, session.user.role)}
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
