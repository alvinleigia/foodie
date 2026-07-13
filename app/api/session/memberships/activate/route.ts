import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { auth, unstable_update } from "@/auth";
import { resolveMembershipAccess } from "@/lib/location-access";
import { getHomePathForRole } from "@/lib/role-access";
import { getTenantDomainAccessScopeFromRequest } from "@/lib/tenant-domains";

export async function GET(request: Request) {
  const session = await auth();

  if (session?.user.kind !== "staff") {
    redirect("/staff/login");
  }

  const membershipId = new URL(request.url).searchParams.get("membershipId");

  if (!membershipId) {
    return NextResponse.json({ error: "Membership is required." }, { status: 400 });
  }

  const accessScope = await getTenantDomainAccessScopeFromRequest(request);
  const access = await resolveMembershipAccess(
    session.user.id,
    membershipId,
    accessScope,
  );

  if (!access) {
    return NextResponse.json({ error: "Membership access not found." }, { status: 403 });
  }

  await unstable_update({
    user: {
      membershipId: access.membershipId,
    },
  });

  redirect(getHomePathForRole(access.role));
}
