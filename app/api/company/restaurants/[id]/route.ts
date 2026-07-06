import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { companyAdminRoles } from "@/lib/role-access";
import { listCompanyRestaurants, updateChildRestaurantAdmin } from "@/lib/saas-admin";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const restaurant = await updateChildRestaurantAdmin(
      session.user.organizationId,
      id,
      await request.json(),
    );

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: restaurant.id,
      action: "company.restaurant.update",
      entityType: "organization",
      entityId: restaurant.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        name: restaurant.name,
        slug: restaurant.slug,
        isActive: restaurant.isActive,
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
      { error: error instanceof Error ? error.message : "Failed to update restaurant." },
      { status: 500 },
    );
  }
}
