import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { updateRestaurantTaxProfile } from "@/lib/restaurant-tax-profile";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const profile = await updateRestaurantTaxProfile(
      context.organizationId,
      await request.json(),
    );

    if (!profile) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.tax_profile.update",
      entityType: "organization_tax_profile",
      entityId: profile.id,
      metadata: {
        defaultTaxRateBps: profile.defaultTaxRateBps,
        pricingMode: profile.pricingMode,
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
