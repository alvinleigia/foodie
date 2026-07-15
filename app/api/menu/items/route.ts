import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { createMenuItem, getAdminMenu } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuItemSchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const item = await createMenuItem(parsed.data, tenantContext);
    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "menu.item.create",
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
      { error: error instanceof Error ? error.message : "Failed to create item." },
      { status: 500 },
    );
  }
}
