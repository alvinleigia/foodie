import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { unstable_update } from "@/auth";
import { requireRole } from "@/lib/auth";
import { resolveMembershipAccess } from "@/lib/location-access";
import { getHomePathForRole } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";

const allStaffRoles: MembershipRole[] = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
  "ORDER_OPERATOR",
];

export async function GET(request: Request) {
  const session = await requireRole(allStaffRoles);

  if (!session) {
    redirect("/staff/login");
  }

  const membershipId = new URL(request.url).searchParams.get("membershipId");

  if (!membershipId) {
    return NextResponse.json({ error: "Membership is required." }, { status: 400 });
  }

  const access = await resolveMembershipAccess(
    session.user.id,
    membershipId,
    { type: "PLATFORM" },
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
