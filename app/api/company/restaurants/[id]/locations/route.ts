import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { companyAdminRoles } from "@/lib/role-access";
import {
  createRestaurantLocation,
  listCompanyRestaurants,
  listRestaurantLocations,
} from "@/lib/saas-admin";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await props.params;
  const locations = await listRestaurantLocations(session.user.organizationId, id);

  if (!locations) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  return NextResponse.json({ locations });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const location = await createRestaurantLocation(
      session.user.organizationId,
      id,
      await request.json(),
    );
    const locations = await listRestaurantLocations(session.user.organizationId, id);

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      locationId: location.id,
      action: "company.location.create",
      entityType: "location",
      entityId: location.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        name: location.name,
        slug: location.slug,
        qrSlug: location.qrSlug,
      },
    });

    return NextResponse.json({
      locations,
      restaurants: await listCompanyRestaurants(session.user.organizationId),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create location." },
      { status: 500 },
    );
  }
}
