import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getAdminMenu, updateMenuCategory } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuCategorySchema } from "@/lib/validations/menu";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
      locationId: null,
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
