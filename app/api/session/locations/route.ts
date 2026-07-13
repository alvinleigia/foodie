import { NextResponse } from "next/server";
import { z } from "zod";

import { auth, unstable_update } from "@/auth";
import { getLocationAccessOptions, resolveLocationAccess } from "@/lib/location-access";
import { getTenantDomainAccessScopeFromRequest } from "@/lib/tenant-domains";

const switchLocationSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth();

  if (session?.user.kind !== "staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessScope = await getTenantDomainAccessScopeFromRequest(request);

  return NextResponse.json({
    active: {
      organizationId: session.user.organizationId,
      locationId: session.user.locationId,
    },
    locations: await getLocationAccessOptions(session.user.id, accessScope),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (session?.user.kind !== "staff") {
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
    await getTenantDomainAccessScopeFromRequest(request),
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
