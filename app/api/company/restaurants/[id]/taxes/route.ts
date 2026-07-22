import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getRestaurantTaxDefinitions,
  saveRestaurantTaxDefinition,
} from "@/lib/restaurant-tax-definitions";
import { companyAdminRoles } from "@/lib/role-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const configuration = await getRestaurantTaxDefinitions(
    id,
    session.user.organizationId,
  );

  if (!configuration) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  return NextResponse.json(configuration);
}

export async function POST(request: Request, context: RouteContext) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const configuration = await saveRestaurantTaxDefinition(id, body, {
      companyOrganizationId: session.user.organizationId,
    });

    if (!configuration) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 },
      );
    }

    const definition = configuration.definitions.find(
      (candidate) =>
        candidate.code === String(body.code ?? "").trim().toUpperCase(),
    );
    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "company.restaurant_tax_definition.create",
      entityType: "organization_tax_definition",
      entityId: definition?.id ?? null,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        code: definition?.code ?? null,
        isDefault: definition?.isDefault ?? false,
      },
    });

    return NextResponse.json(configuration, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create tax.",
      },
      { status: 500 },
    );
  }
}
