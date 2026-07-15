import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createMenuModifierOption,
  getAdminMenu,
  getMenuModifierGroups,
} from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuModifierOptionSchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuModifierOptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const option = await createMenuModifierOption(parsed.data, tenantContext);

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "menu.modifier.create",
      entityType: "modifier_option",
      entityId: option.id,
      metadata: {
        name: option.name,
        groupId: option.groupId,
        priceDelta: option.priceDelta,
      },
    });

    return NextResponse.json({
      categories: await getAdminMenu(tenantContext),
      modifierGroups: await getMenuModifierGroups(tenantContext),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create add-on option." },
      { status: 500 },
    );
  }
}
