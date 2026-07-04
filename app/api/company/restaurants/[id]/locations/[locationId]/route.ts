import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { companyAdminRoles } from "@/lib/role-access";
import {
  listCompanyRestaurants,
  listRestaurantLocations,
  updateRestaurantLocation,
} from "@/lib/saas-admin";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; locationId: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, locationId } = await props.params;
    const location = await updateRestaurantLocation(
      session.user.organizationId,
      id,
      locationId,
      await request.json(),
    );

    if (!location) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      locationId: location.id,
      action: "company.location.update",
      entityType: "location",
      entityId: location.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        name: location.name,
        slug: location.slug,
        qrSlug: location.qrSlug,
        isActive: location.isActive,
      },
    });

    return NextResponse.json({
      locations: await listRestaurantLocations(session.user.organizationId, id),
      restaurants: await listCompanyRestaurants(session.user.organizationId),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update location." },
      { status: 500 },
    );
  }
}
