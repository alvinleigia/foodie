import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { updateRestaurantTaxProfile } from "@/lib/restaurant-tax-profile";
import { companyAdminRoles } from "@/lib/role-access";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const profile = await updateRestaurantTaxProfile(
      id,
      await request.json(),
      session.user.organizationId,
    );

    if (!profile) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "company.restaurant_tax_profile.update",
      entityType: "organization_tax_profile",
      entityId: profile.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        defaultTaxRateBps: profile.defaultTaxRateBps,
        registrationStatus: profile.registrationStatus,
        taxSystem: profile.taxSystem,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tax profile." },
      { status: 500 },
    );
  }
}
