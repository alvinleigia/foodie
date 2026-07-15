import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getAdminMenu, updateMenuItem } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuItemSchema } from "@/lib/validations/menu";

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
    const parsed = menuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const item = await updateMenuItem(id, parsed.data, tenantContext);

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "menu.item.update",
      entityType: "menu_item",
      entityId: item.id,
      metadata: {
        name: item.name,
        slug: item.slug,
        categoryId: item.categoryId,
        isActive: item.isActive,
        isSoldOut: item.isSoldOut,
      },
    });

    return NextResponse.json({ categories: await getAdminMenu(tenantContext) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item." },
      { status: 500 },
    );
  }
}
