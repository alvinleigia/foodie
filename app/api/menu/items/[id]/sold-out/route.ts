import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getAdminMenu, updateMenuItemSoldOut } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const soldOutSchema = z.object({
  isSoldOut: z.boolean(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = soldOutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const item = await updateMenuItemSoldOut(
      id,
      parsed.data.isSoldOut,
      tenantContext,
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "menu.item.availability.update",
      entityType: "menu_item",
      entityId: item.id,
      metadata: {
        name: item.name,
        slug: item.slug,
        isSoldOut: item.isSoldOut,
      },
    });

    return NextResponse.json({ categories: await getAdminMenu(tenantContext) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item availability." },
      { status: 500 },
    );
  }
}
