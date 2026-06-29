import { NextResponse } from "next/server";
import { z } from "zod";

import { auth, unstable_update } from "@/auth";
import {
  getMembershipAccessOptions,
  resolveMembershipAccess,
} from "@/lib/location-access";
import { getHomePathForRole } from "@/lib/role-access";
import { getTenantDomainAccessScopeFromRequest } from "@/lib/tenant-domains";

const switchMembershipSchema = z.object({
  membershipId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessScope = await getTenantDomainAccessScopeFromRequest(request);

  return NextResponse.json({
    active: {
      organizationId: session.user.organizationId,
      locationId: session.user.locationId,
      role: session.user.role,
    },
    memberships: await getMembershipAccessOptions(session.user.id, accessScope),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = switchMembershipSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const accessScope = await getTenantDomainAccessScopeFromRequest(request);
  const access = await resolveMembershipAccess(
    session.user.id,
    parsed.data.membershipId,
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

  return NextResponse.json({
    active: access,
    redirectTo: getHomePathForRole(access.role),
  });
}
