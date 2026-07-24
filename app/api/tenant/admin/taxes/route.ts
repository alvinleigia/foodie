import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getRestaurantTaxDefinitions,
  saveRestaurantTaxDefinition,
} from "@/lib/restaurant-tax-definitions";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  const configuration = await getRestaurantTaxDefinitions(
    context.organizationId,
  );

  return NextResponse.json(configuration);
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("restaurant.settings");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const body = await request.json();
    const configuration = await saveRestaurantTaxDefinition(
      context.organizationId,
      body,
    );
    const definition = configuration?.definitions.find(
      (candidate) =>
        candidate.code === String(body.code ?? "").trim().toUpperCase(),
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.tax_definition.create",
      entityType: "organization_tax_definition",
      entityId: definition?.id ?? null,
      metadata: {
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
