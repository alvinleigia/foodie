import { NextResponse } from "next/server";
import { z } from "zod";

import { unstable_update } from "@/auth";
import { requireRole } from "@/lib/auth";
import { getLocationAccessOptions, resolveLocationAccess } from "@/lib/location-access";
import type { MembershipRole } from "@/lib/staff-auth";

const allStaffRoles: MembershipRole[] = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
  "ORDER_OPERATOR",
];

const switchLocationSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
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
    },
    locations: await getLocationAccessOptions(session.user.id, { type: "PLATFORM" }),
  });
}

export async function PATCH(request: Request) {
  const session = await requireRole(allStaffRoles);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = switchLocationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const access = await resolveLocationAccess(
    session.user.id,
    parsed.data.organizationId,
    parsed.data.locationId,
    { type: "PLATFORM" },
  );

  if (!access) {
    return NextResponse.json({ error: "Location access not found." }, { status: 403 });
  }

  await unstable_update({
    user: {
      organizationId: access.organizationId,
      locationId: access.locationId,
    },
  });

  return NextResponse.json({ active: access });
}
