import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { deleteMenuCategory, getAdminMenu, MenuCategoryNotEmptyError, updateMenuCategory } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuCategorySchema } from "@/lib/validations/menu";
import { logError } from "@/lib/logger";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireMenuManagerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    const tenantContext = await getCurrentTenantContext();
    const category = await deleteMenuCategory(parsedId.data, tenantContext, session.user);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ deletedCategoryId: category.id });
  } catch (error) {
    if (error instanceof MenuCategoryNotEmptyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logError("menu.category.delete_failed", error);
    return NextResponse.json({ error: "Category could not be deleted. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = menuCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const category = await updateMenuCategory(id, parsed.data, tenantContext);

    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "menu.category.update",
      entityType: "menu_category",
      entityId: category.id,
      metadata: {
        name: category.name,
        slug: category.slug,
        isActive: category.isActive,
      },
    });

    return NextResponse.json({ categories: await getAdminMenu(tenantContext) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update category." },
      { status: 500 },
    );
  }
}
