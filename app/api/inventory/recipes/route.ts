import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  IngredientInventoryNotFoundError,
  saveMenuItemRecipe,
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
    const configuration = await saveMenuItemRecipe(context, body);
    const product = configuration.products.find(
      (item) => item.id === body?.menuItemId,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "inventory.recipe.update",
      entityType: "menu_item",
      entityId: product?.id ?? null,
      metadata: {
        productName: product?.name ?? null,
        ingredientCount: product?.recipe.length ?? 0,
      },
    });

    return NextResponse.json(configuration);
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof IngredientInventoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save recipe.",
      },
      { status: 500 },
    );
  }
}
