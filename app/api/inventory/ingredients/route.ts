import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  getIngredientInventoryConfiguration,
  IngredientInventoryConflictError,
  IngredientInventoryNotFoundError,
  saveIngredient,
} from "@/lib/ingredient-inventory";
import { getCurrentTenantContext } from "@/lib/tenant-context";

async function requireIngredientInventoryAccess() {
  const session = await requireStaffPermission("inventory.manage");

  if (!session) {
    return null;
  }

  const context = await getCurrentTenantContext();
  await assertOrganizationFeatureEnabled(
    context.organizationId,
    "operations.inventory",
  );

  return { context, session };
}

export async function GET() {
  try {
    const access = await requireIngredientInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      await getIngredientInventoryConfiguration(access.context),
    );
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load ingredient inventory.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireIngredientInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const configuration = await saveIngredient(
      access.context,
      body,
      access.session.user.id,
    );
    const savedIngredient = body?.id
      ? configuration.ingredients.find((ingredient) => ingredient.id === body.id)
      : configuration.ingredients.find(
          (ingredient) =>
            ingredient.name.toLocaleLowerCase() ===
            String(body?.name ?? "").trim().toLocaleLowerCase(),
        );

    await writeAuditLog({
      actor: access.session.user,
      organizationId: access.context.organizationId,
      action: body?.id
        ? "inventory.ingredient.update"
        : "inventory.ingredient.create",
      entityType: "inventory_ingredient",
      entityId: savedIngredient?.id ?? null,
      metadata: {
        name: savedIngredient?.name ?? null,
        unit: savedIngredient?.unit ?? null,
        isActive: savedIngredient?.isActive ?? null,
      },
    });

    return NextResponse.json(configuration, { status: body?.id ? 200 : 201 });
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
          error instanceof Error ? error.message : "Failed to save ingredient.",
      },
      { status: 500 },
    );
  }
}
