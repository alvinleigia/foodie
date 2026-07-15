import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { createMenuCategory, getAdminMenu } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuCategorySchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const category = await createMenuCategory(parsed.data, tenantContext);
    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "menu.category.create",
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
      { error: error instanceof Error ? error.message : "Failed to create category." },
      { status: 500 },
    );
  }
}
