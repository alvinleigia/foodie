import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { companyAdminRoles } from "@/lib/role-access";
import { createChildRestaurant, listCompanyRestaurants } from "@/lib/saas-admin";

export async function GET() {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    restaurants: await listCompanyRestaurants(session.user.organizationId),
  });
}

export async function POST(request: Request) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const restaurant = await createChildRestaurant(
      session.user.organizationId,
      await request.json(),
    );
    await writeAuditLog({
      actor: session.user,
      organizationId: restaurant.id,
      locationId: restaurant.primaryLocation.id,
      action: "company.restaurant.create",
      entityType: "organization",
      entityId: restaurant.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        name: restaurant.name,
        slug: restaurant.slug,
        primaryLocationId: restaurant.primaryLocation.id,
      },
    });

    return NextResponse.json({
      restaurants: await listCompanyRestaurants(session.user.organizationId),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create restaurant." },
      { status: 500 },
    );
  }
}
