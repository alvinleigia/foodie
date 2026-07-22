import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { saveRestaurantTaxDefinition } from "@/lib/restaurant-tax-definitions";
import { companyAdminRoles } from "@/lib/role-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; taxId: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, taxId } = await context.params;
    const body = await request.json();
    const configuration = await saveRestaurantTaxDefinition(id, body, {
      companyOrganizationId: session.user.organizationId,
      taxDefinitionId: taxId,
    });

    if (!configuration) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 },
      );
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "company.restaurant_tax_definition.update",
      entityType: "organization_tax_definition",
      entityId: taxId,
      metadata: {
        companyOrganizationId: session.user.organizationId,
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
