import { NextResponse } from "next/server";
import { z } from "zod";

import { unstable_update } from "@/auth";
import { requireRole } from "@/lib/auth";
import {
  getMembershipAccessOptions,
  resolveMembershipAccess,
} from "@/lib/location-access";
import { getHomePathForRole } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";

const allStaffRoles: MembershipRole[] = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
  "ORDER_OPERATOR",
];

const switchMembershipSchema = z.object({
  membershipId: z.string().uuid(),
});

export async function GET() {
  const session = await requireRole(allStaffRoles);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    active: {
      organizationId: session.user.organizationId,
      locationId: session.user.locationId,
      role: session.user.role,
    },
    memberships: await getMembershipAccessOptions(session.user.id, { type: "PLATFORM" }),
  });
}

export async function PATCH(request: Request) {
  const session = await requireRole(allStaffRoles);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = switchMembershipSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const access = await resolveMembershipAccess(
    session.user.id,
    parsed.data.membershipId,
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

  return NextResponse.json({
    active: access,
    redirectTo: getHomePathForRole(access.role),
  });
}
