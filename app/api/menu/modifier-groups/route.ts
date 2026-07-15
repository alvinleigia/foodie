import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  createMenuModifierGroup,
  getAdminMenu,
  getMenuModifierGroups,
} from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { menuModifierGroupSchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuModifierGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getCurrentTenantContext();
    const group = await createMenuModifierGroup(parsed.data, tenantContext);

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      locationId: null,
      action: "menu.modifier_group.create",
      entityType: "modifier_group",
      entityId: group.id,
      metadata: {
        name: group.name,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
      },
    });

    return NextResponse.json({
      categories: await getAdminMenu(tenantContext),
      modifierGroups: await getMenuModifierGroups(tenantContext),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create add-on group." },
      { status: 500 },
    );
  }
}
