import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { getKdsBoard } from "@/lib/kds";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffPermission("orders.view");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const board = await getKdsBoard(
      session.user.permissions.includes("orders.update_status"),
      tenantContext,
    );

    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load preparation tickets.",
      },
      { status: 500 },
    );
  }
}
