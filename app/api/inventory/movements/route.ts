import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  IngredientInventoryConflictError,
  IngredientInventoryNotFoundError,
  recordIngredientMovement,
} from "@/lib/ingredient-inventory";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: Request) {
  try {
    const session = await requireStaffPermission("inventory.manage");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await getCurrentTenantContext();
    await assertOrganizationFeatureEnabled(
      context.organizationId,
      "operations.inventory",
    );

    const body = await request.json();
    const configuration = await recordIngredientMovement(
      context,
      body,
      session.user.id,
    );
    const movement = configuration.movements[0] ?? null;

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "inventory.ingredient_movement.create",
      entityType: "inventory_ingredient",
      entityId: movement?.ingredientId ?? body?.ingredientId ?? null,
      metadata: {
        movementType: movement?.movementType ?? body?.action ?? null,
        quantityDelta: movement?.quantityDelta ?? null,
        quantityAfter: movement?.quantityAfter ?? null,
        reason: movement?.reason ?? body?.reason ?? null,
      },
    });

    return NextResponse.json(configuration, { status: 201 });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof IngredientInventoryConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof IngredientInventoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to record stock movement.",
      },
      { status: 500 },
    );
  }
}
