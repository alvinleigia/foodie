import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { saveRestaurantTaxDefinition } from "@/lib/restaurant-tax-definitions";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taxId: string }> },
) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const { taxId } = await context.params;
    const body = await request.json();
    const configuration = await saveRestaurantTaxDefinition(
      tenantContext.organizationId,
      body,
      { taxDefinitionId: taxId },
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.tax_definition.update",
      entityType: "organization_tax_definition",
      entityId: taxId,
      metadata: {
        code: String(body.code ?? "").trim().toUpperCase(),
        isDefault: body.isDefault === true,
      },
    });

    return NextResponse.json(configuration);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update tax.",
      },
      { status: 500 },
    );
  }
}
